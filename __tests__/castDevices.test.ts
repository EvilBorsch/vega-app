import {mergeCastDevices} from '../src/lib/remote/castDevices';

const haier = {deviceId: '582a001d', friendlyName: 'Телевизор в гостиной'};
const kitchen = {deviceId: 'k1', friendlyName: 'Kitchen'};

it('lists devices Vega found itself when the library list stayed empty', () => {
  expect(mergeCastDevices(null, [], [haier])).toEqual([haier]);
});

it('keeps one entry per device across both lists, connected device first', () => {
  expect(mergeCastDevices(kitchen, [haier, kitchen], [kitchen, haier])).toEqual([kitchen, haier]);
});

it('keeps library-only devices', () => {
  expect(mergeCastDevices(null, [kitchen], [])).toEqual([kitchen]);
});
