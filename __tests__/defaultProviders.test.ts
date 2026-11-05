import {ExtensionManager} from '../src/lib/services/ExtensionManager';
import {extensionStorage} from '../src/lib/storage/extensionStorage';
import {mainStorage} from '../src/lib/storage/StorageService';

jest.mock('axios', () => ({get: jest.fn()}));
jest.mock('../src/lib/storage/StorageService', () => ({mainStorage: {getBool: jest.fn(), setBool: jest.fn(), getString: jest.fn(), delete: jest.fn()}}));
jest.mock('../src/lib/storage/sourceTokenStorage', () => ({getSourceAuthHeaders: () => ({}), sourceTokenStorage: {has: () => false}}));
jest.mock('../src/lib/storage/extensionStorage', () => ({extensionStorage: {
  getProviderSources: jest.fn(), addProviderSources: jest.fn(), getInstalledProviders: jest.fn(), setInstalledProviders: jest.fn(), setDefaultProviderSource: jest.fn(),
}}));
const source = {author: 'Zenda-Cross', url: 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main'};
const torrentio = {value: 'torrentio', display_name: 'Torrentio', source, version: '1.0'} as any;
let done = false;
let sources: any[];
beforeEach(() => {
  jest.clearAllMocks(); done = false;
  jest.mocked(mainStorage.getBool).mockImplementation(() => done);
  jest.mocked(mainStorage.setBool).mockImplementation((_key, value) => {done = value;});
  sources = [];
  jest.mocked(extensionStorage.getProviderSources).mockImplementation(() => sources);
  jest.mocked(extensionStorage.getInstalledProviders).mockReturnValue([]);
  jest.mocked(mainStorage.getString).mockReturnValue(undefined);
  jest.mocked(extensionStorage.addProviderSources).mockImplementation((author, url) => {sources.push({author, url});});
});
const setup = () => {
  const manager = new ExtensionManager();
  const manifest = jest.spyOn(manager, 'fetchManifest').mockResolvedValue([torrentio]);
  const install = jest.spyOn(manager, 'installProvider').mockResolvedValue();
  return {manager, manifest, install};
};
it('adds Zenda-Cross and installs Torrentio on first startup', async () => {
  const {manager, install} = setup();
  await manager.ensureDefaultProviders();
  expect(extensionStorage.addProviderSources).toHaveBeenCalledWith(source.author, source.url);
  expect(install).toHaveBeenCalledWith(torrentio, expect.any(Function));
  expect(done).toBe(true);
});
it('does not reinstall defaults deliberately removed after initialization', async () => {
  const {manager, install} = setup();
  await manager.ensureDefaultProviders();
  await manager.ensureDefaultProviders();
  expect(install).toHaveBeenCalledTimes(1);
});
it('keeps an existing provider installation and its settings', async () => {
  jest.mocked(extensionStorage.getProviderSources).mockReturnValue([source]);
  jest.mocked(extensionStorage.getInstalledProviders).mockReturnValue([torrentio]);
  const {manager, manifest, install} = setup();
  await manager.ensureDefaultProviders();
  expect(manifest).not.toHaveBeenCalled();
  expect(install).not.toHaveBeenCalled();
  expect(done).toBe(true);
});
it('retries an interrupted first installation on the next startup', async () => {
  const {manager, install} = setup();
  install.mockRejectedValueOnce(new Error('offline'));
  await expect(manager.ensureDefaultProviders()).rejects.toThrow('offline');
  expect(done).toBe(false);
  await manager.ensureDefaultProviders();
  expect(install).toHaveBeenCalledTimes(2);
  expect(done).toBe(true);
});
it('shares concurrent startup requests', async () => {
  const {manager, install} = setup();
  await Promise.all([manager.ensureDefaultProviders(), manager.ensureDefaultProviders()]);
  expect(install).toHaveBeenCalledTimes(1);
});
it('does not overwrite an existing source URL or default selection', async () => {
  const custom = {...source, url: 'https://example.com/providers', isDefault: true};
  jest.mocked(extensionStorage.getProviderSources).mockReturnValue([custom]);
  const {manager, manifest} = setup();
  await manager.ensureDefaultProviders();
  expect(extensionStorage.addProviderSources).not.toHaveBeenCalled();
  expect(manifest).toHaveBeenCalledWith(custom);
});
it('migrates the legacy custom source before adding defaults', async () => {
  const sources: any[] = [];
  jest.mocked(mainStorage.getString).mockReturnValue('Legacy');
  jest.mocked(extensionStorage.getProviderSources).mockImplementation(() => sources);
  jest.mocked(extensionStorage.getInstalledProviders).mockReturnValue([{value: 'custom'} as any]);
  jest.mocked(extensionStorage.addProviderSources).mockImplementation((author, url) => {sources.push({author, url});});
  const {manager} = setup();
  await manager.ensureDefaultProviders();
  expect(sources.map(item => item.author)).toEqual(['Legacy', 'Zenda-Cross']);
  expect(extensionStorage.setDefaultProviderSource).toHaveBeenCalledWith('Legacy');
  expect(extensionStorage.setInstalledProviders).toHaveBeenCalledWith([
    expect.objectContaining({value: 'custom', source: expect.objectContaining({author: 'Legacy'})}),
  ]);
});
it('honors a source removed while the initial manifest is loading', async () => {
  const {manager, manifest, install} = setup();
  let finish!: (providers: any[]) => void;
  manifest.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const loading = manager.ensureDefaultProviders();
  sources = [];
  finish([torrentio]);
  await loading;
  expect(install).not.toHaveBeenCalled();
  expect(done).toBe(true);
});
