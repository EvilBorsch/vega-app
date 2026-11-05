import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  Text,
  TouchableOpacity,
  ToastAndroid,
  View,
  Modal,
  ScrollView,
  StyleSheet,
  UIManager,
  findNodeHandle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import React, { useEffect, useRef } from 'react';
import { Stream } from '../lib/providers/types';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import LoadingIndicator from './ui/LoadingIndicator';
import RNReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Clipboard } from 'react-native';
import { TextTrackType } from 'react-native-video';
import { settingsStorage } from '../lib/storage';
import { useM3Colors } from '../theme/M3PaletteContext';
import { isTV } from '../lib/tv';
import { TVFocusable, TVFocusGuide } from './tv';
import MovieServerDialog from './MovieServerDialog';
import {useSwarmHealth} from '../lib/player/swarmHealth';

const KEEP_DOWNLOAD_SOURCES = new Set<string>();

function DownloadSourcePicker({streams, loading, title, error, onSelect, onDismiss, footer, renderSourceActions}: {
  streams: Stream[];
  loading: boolean;
  title?: string;
  error?: string | null;
  onSelect: (stream: Stream) => void;
  onDismiss: () => void;
  footer?: React.ReactNode;
  renderSourceActions?: (stream: Stream, select: (onSelected?: () => void) => Promise<void>) => React.ReactNode;
}) {
  const swarm = useSwarmHealth(streams, {enabled: !loading, keep: KEEP_DOWNLOAD_SOURCES});
  return <MovieServerDialog streams={swarm.visible} hiddenStreams={swarm.hidden} checking={swarm.checking}
    loading={loading} subtitle={title} error={error} action="download" onSelect={onSelect} onDismiss={onDismiss}
    footer={footer} renderSourceActions={renderSourceActions} />;
}

const NativeTouchableOpacity = TouchableOpacity;

type SheetButtonProps = React.ComponentProps<typeof TouchableOpacity> & {
  hasTVPreferredFocus?: boolean;
  focusBorderRadius?: number;
};

const SheetButton = ({
  activeOpacity,
  hitSlop,
  style,
  hasTVPreferredFocus,
  focusBorderRadius = 12,
  onPress,
  onLongPress,
  accessibilityLabel,
  disabled,
  testID,
  children,
  ...props
}: SheetButtonProps) => {
  if (isTV) {
    return (
      <TVFocusable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        testID={testID}
        style={style as StyleProp<ViewStyle>}
        borderRadius={focusBorderRadius}
        focusScale={1}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onPress={() => onPress?.(undefined as any)}
        onLongPress={() => onLongPress?.(undefined as any)}>
        {children}
      </TVFocusable>
    );
  }

  return (
    <NativeTouchableOpacity
      {...props}
      activeOpacity={activeOpacity}
      hitSlop={hitSlop}
      style={style}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      testID={testID}>
      {children}
    </NativeTouchableOpacity>
  );
};

export interface DownloadedSubtitleItem {
  id: string;
  title: string;
  language?: string;
  filePath?: string;
}

type Props = {
  data: Stream[];
  loading: boolean;
  title?: string;
  showModal: boolean;
  setModal: (value: boolean) => void;
  onPressVideo: (item: any) => void;
  onPressExternalVideo?: (item: any) => void;
  onPressSubs: (item: any) => void;
  onPressExternalSubs?: (item: any) => void;
  error?: string | null;
  videoDownloaded?: boolean;
  downloadedServer?: string;
  onDeleteVideo?: () => void;
  downloadedSubtitles?: DownloadedSubtitleItem[];
  isSubDownloaded?: (subTitle: string) => boolean;
  onDeleteSub?: (subTitle: string) => void;
};
const DownloadBottomSheet = ({
  data,
  loading,
  showModal,
  setModal,
  title,
  onPressSubs,
  onPressExternalSubs,
  onPressVideo,
  onPressExternalVideo,
  error,
  videoDownloaded,
  downloadedServer,
  onDeleteVideo,
  downloadedSubtitles,
  isSubDownloaded,
  onDeleteSub,
}: Props) => {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const tvCloseRef = useRef<View>(null);
  const closeSheet = () => {
    setModal(false);
  };
  const colors = useM3Colors();
  const [activeTab, setActiveTab] = React.useState<1 | 2>(1);
  const isAlwaysExternal =
    settingsStorage.getBool('alwaysExternalDownloader') === true;
  const streams = Array.isArray(data) ? data : [];

  const downloadedSubs = downloadedSubtitles || [];
  const hasDownloadedSubs = downloadedSubs.length > 0;

  const rawSubtitles = streams
    .flatMap(server => server.subtitles || [])
    .filter(Boolean);

  const streamSubtitles = rawSubtitles.filter(
    (sub, index, self) =>
      index ===
      self.findIndex(
        s =>
          s.uri === sub.uri ||
          (s.title === sub.title && s.language === sub.language),
      ),
  );

  const hasSubtitles = hasDownloadedSubs || streamSubtitles.length > 0;

  const handleCopy = (link: string) => {
    if (settingsStorage.isHapticFeedbackEnabled()) {
      RNReactNativeHapticFeedback.trigger('effectTick', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    }
    Clipboard.setString(link);
    ToastAndroid.show('Link copied', ToastAndroid.SHORT);
  };

  useEffect(() => {
    if (showModal) {
      setActiveTab(1);
      bottomSheetRef.current?.snapToIndex?.(0);
    }
  }, [showModal]);

  const renderVideoTab = () => {
    if (videoDownloaded) {
      return (
        <View
          style={{
            alignItems: 'center',
            backgroundColor: colors.surfaceContainerHighest,
            borderColor: colors.outlineVariant,
            borderRadius: 16,
            borderWidth: 1,
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginVertical: 6,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: colors.primaryContainer,
                borderRadius: 12,
                height: 38,
                justifyContent: 'center',
                width: 38,
              }}>
              <MaterialCommunityIcons
                name="check-circle"
                size={22}
                color={colors.onPrimaryContainer}
              />
            </View>
            <View>
              <Text
                style={{
                  color: colors.onSurface,
                  fontSize: 15,
                  fontWeight: '700',
                }}>
                Video Downloaded
              </Text>
              {downloadedServer && (
                <Text
                  style={{
                    color: colors.onSurfaceVariant,
                    fontSize: 12,
                    marginTop: 2,
                  }}>
                  {downloadedServer}
                </Text>
              )}
            </View>
          </View>
          <SheetButton
            accessibilityLabel="Delete downloaded video"
            activeOpacity={0.7}
            onPress={() => {
              onDeleteVideo?.();
              closeSheet();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              alignItems: 'center',
              backgroundColor: colors.errorContainer,
              borderRadius: 12,
              height: 38,
              justifyContent: 'center',
              width: 38,
            }}>
            <MaterialCommunityIcons
              name="delete-outline"
              size={20}
              color={colors.onErrorContainer}
            />
          </SheetButton>
        </View>
      );
    }

    return null;
  };

  const renderSubtitleTab = () => {
    if (loading) {
      return (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <LoadingIndicator size={40} color={colors.primary} />
          <Text
            style={{
              color: colors.onSurfaceVariant,
              fontSize: 13,
              marginTop: 14,
            }}>
            Fetching subtitles…
          </Text>
        </View>
      );
    }

    if (!hasSubtitles) {
      return (
        <View style={{ alignItems: 'center', paddingVertical: 36 }}>
          <MaterialCommunityIcons
            name="subtitles-outline"
            size={40}
            color={colors.onSurfaceVariant}
          />
          <Text
            style={{
              color: colors.onSurfaceVariant,
              fontSize: 14,
              marginTop: 10,
              textAlign: 'center',
            }}>
            No subtitles available
          </Text>
        </View>
      );
    }

    return (
      <>
        {/* Downloaded Subtitles Section */}
        {downloadedSubs.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text
              style={{
                color: colors.primary,
                fontSize: 12,
                fontWeight: '700',
                letterSpacing: 0.8,
                marginBottom: 6,
                textTransform: 'uppercase',
              }}>
              Downloaded
            </Text>
            {downloadedSubs.map((sub, index) => (
              <View
                key={sub.id || index}
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.surfaceContainerHighest,
                  borderColor: colors.outlineVariant,
                  borderRadius: 16,
                  borderWidth: 1,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginVertical: 4,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}>
                <View
                  style={{
                    alignItems: 'center',
                    flexDirection: 'row',
                    gap: 10,
                    flex: 1,
                  }}>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.onSurface,
                      fontSize: 14,
                      fontWeight: '600',
                      flex: 1,
                    }}>
                    {sub.title}
                  </Text>
                </View>
                <SheetButton
                  accessibilityLabel={`Delete downloaded subtitle ${sub.title}`}
                  activeOpacity={0.7}
                  onPress={() => {
                    onDeleteSub?.(sub.title);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    alignItems: 'center',
                    backgroundColor: colors.errorContainer,
                    borderRadius: 10,
                    height: 34,
                    justifyContent: 'center',
                    width: 34,
                  }}>
                  <MaterialCommunityIcons
                    name="delete-outline"
                    size={18}
                    color={colors.onErrorContainer}
                  />
                </SheetButton>
              </View>
            ))}
          </View>
        ) : null}

        {/* Stream Subtitles Section */}
        {streamSubtitles.length > 0 ? (
          <View>
            {downloadedSubs.length > 0 ? (
              <Text
                style={{
                  color: colors.onSurfaceVariant,
                  fontSize: 12,
                  fontWeight: '700',
                  letterSpacing: 0.8,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                }}>
                Available
              </Text>
            ) : null}
            {streamSubtitles.map((sub, index) => {
              const subDownloaded = isSubDownloaded
                ? isSubDownloaded(sub.title)
                : false;
              return (
                <View
                  key={index}
                  style={{
                    alignItems: 'center',
                    backgroundColor: colors.surfaceContainerHighest,
                    borderColor: colors.outlineVariant,
                    borderRadius: 16,
                    borderWidth: 1,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginVertical: 4,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}>
                  <View
                    style={{
                      alignItems: 'center',
                      flexDirection: 'row',
                      gap: 8,
                      flex: 1,
                      marginRight: 10,
                    }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: colors.onSurface,
                        fontSize: 14,
                        fontWeight: '600',
                        flex: 1,
                      }}>
                      {sub.title}
                    </Text>
                    {sub.type ? (
                      <View
                        style={{
                          backgroundColor: colors.secondaryContainer,
                          borderRadius: 8,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}>
                        <Text
                          style={{
                            color: colors.onSecondaryContainer,
                            fontSize: 10,
                            fontWeight: '700',
                          }}>
                          {sub.type.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View
                    style={{
                      alignItems: 'center',
                      flexDirection: 'row',
                      gap: 6,
                      flexShrink: 0,
                    }}>
                    {/* Copy Subtitle Link Button */}
                    <SheetButton
                      accessibilityLabel={`Copy subtitle link for ${sub.title}`}
                      activeOpacity={0.7}
                      onPress={() => handleCopy(sub.uri)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{
                        alignItems: 'center',
                        backgroundColor: colors.surfaceContainerHighest,
                        borderRadius: 10,
                        justifyContent: 'center',
                        padding: 8,
                      }}>
                      <MaterialCommunityIcons
                        name="content-copy"
                        size={18}
                        color={colors.onSurfaceVariant}
                      />
                    </SheetButton>

                    {/* External Subtitle Button */}
                    <SheetButton
                      accessibilityLabel={`Open subtitle externally: ${sub.title}`}
                      activeOpacity={0.7}
                      onPress={() => {
                        onPressExternalSubs?.({
                          link: sub.uri,
                          type: TextTrackType.VTT,
                          title: sub.title,
                        });
                        closeSheet();
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{
                        alignItems: 'center',
                        backgroundColor: colors.surfaceContainerHighest,
                        borderRadius: 10,
                        justifyContent: 'center',
                        padding: 8,
                      }}>
                      <MaterialCommunityIcons
                        name="open-in-new"
                        size={18}
                        color={colors.onSurfaceVariant}
                      />
                    </SheetButton>

                    {/* Download / Delete Subtitle Button */}
                    {subDownloaded ? (
                      <SheetButton
                        accessibilityLabel={`Delete downloaded subtitle ${sub.title}`}
                        activeOpacity={0.7}
                        onPress={() => {
                          onDeleteSub?.(sub.title);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{
                          alignItems: 'center',
                          backgroundColor: colors.errorContainer,
                          borderRadius: 10,
                          height: 34,
                          justifyContent: 'center',
                          width: 34,
                        }}>
                        <MaterialCommunityIcons
                          name="delete-outline"
                          size={18}
                          color={colors.onErrorContainer}
                        />
                      </SheetButton>
                    ) : (
                      <SheetButton
                        accessibilityLabel={`Download subtitle ${sub.title}`}
                        activeOpacity={0.7}
                        onPress={() => {
                          onPressSubs({
                            link: sub.uri,
                            type: TextTrackType.VTT,
                            title: sub.title,
                          });
                          closeSheet();
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{
                          alignItems: 'center',
                          backgroundColor: colors.primaryContainer,
                          borderRadius: 10,
                          height: 34,
                          justifyContent: 'center',
                          width: 34,
                        }}>
                        <MaterialCommunityIcons
                          name="download"
                          size={18}
                          color={colors.onPrimaryContainer}
                        />
                      </SheetButton>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : downloadedSubs.length > 0 ? (
          <Text
            style={{
              color: colors.onSurfaceVariant,
              fontSize: 13,
              textAlign: 'center',
              marginTop: 20,
            }}>
            No extra subtitles available
          </Text>
        ) : null}
      </>
    );
  };

  if (!showModal) {
    return null;
  }

  if (!videoDownloaded && activeTab === 1) {
    return <DownloadSourcePicker streams={streams} loading={loading} title={title} error={error}
      onDismiss={closeSheet} onSelect={stream => {
        if (isAlwaysExternal && onPressExternalVideo) onPressExternalVideo(stream);
        else onPressVideo(stream);
        closeSheet();
      }}
      renderSourceActions={(stream, select) => <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 8}}>
        <SheetButton accessibilityLabel={`Copy link for ${stream.server}`} onPress={() => handleCopy(stream.link)} style={{padding: 8}}>
          <MaterialCommunityIcons name="content-copy" size={18} color={colors.onSurfaceVariant} />
        </SheetButton>
        {onPressExternalVideo && <SheetButton accessibilityLabel={`${isAlwaysExternal ? 'Download in Vega' : 'Open externally'}: ${stream.server}`}
          onPress={() => select(() => {if (isAlwaysExternal) onPressVideo(stream); else onPressExternalVideo(stream); closeSheet();})} style={{padding: 8}}>
          <MaterialCommunityIcons name={isAlwaysExternal ? 'download' : 'open-in-new'} size={18} color={colors.onSurfaceVariant} />
        </SheetButton>}
      </View>}
      footer={hasSubtitles ? <SheetButton accessibilityLabel="Subtitle download sources" onPress={() => setActiveTab(2)} style={{padding: 10, alignItems: 'center'}}>
        <Text style={{color: colors.primary}}>Subtitles ({downloadedSubs.length + streamSubtitles.length})</Text>
      </SheetButton> : undefined} />;
  }

  if (isTV) {
    return (
      <Modal
        visible
        transparent
        animationType="none"
        onRequestClose={() => setModal(false)}
        onShow={() => {
          setTimeout(() => {
            const handle = findNodeHandle(tvCloseRef.current);
            if (handle) UIManager.dispatchViewManagerCommand(handle, 'requestTVFocus', []);
          }, 250);
        }}>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.78)'}}>
          <TVFocusGuide
            autoFocus
            trapFocusLeft
            trapFocusRight
            trapFocusUp
            trapFocusDown
            style={{
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
              borderRadius: 24,
              borderWidth: 1,
              maxHeight: '85%',
              minHeight: 240,
              padding: 24,
              width: '80%',
            }}>
            <TVFocusable
              ref={tvCloseRef}
              accessibilityRole="button"
              accessibilityLabel="Close downloads"
              hasTVPreferredFocus
              focusScale={1}
              onPress={() => setModal(false)}
              style={{alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 100, marginBottom: 12}}>
              <Text style={{color: colors.onSurface, fontSize: 18}}>Close</Text>
            </TVFocusable>
            {hasSubtitles && (
              <View style={{flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 12}}>
                {([{label: 'Video', value: 1 as const}, {label: 'Subtitle', value: 2 as const}] as const).map(tab => (
                  <SheetButton
                    key={tab.value}
                    accessibilityLabel={`${tab.label} download sources`}
                    onPress={() => setActiveTab(tab.value)}
                    style={{backgroundColor: activeTab === tab.value ? colors.secondaryContainer : colors.surfaceContainerHighest, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12}}>
                    <Text style={{color: activeTab === tab.value ? colors.onSecondaryContainer : colors.onSurface, fontSize: 16}}>{tab.label}</Text>
                  </SheetButton>
                ))}
              </View>
            )}
            <ScrollView
              focusable={false}
              accessible={false}
              contentContainerStyle={{paddingBottom: 24}}>
              {activeTab === 1 ? renderVideoTab() : renderSubtitleTab()}
            </ScrollView>
          </TVFocusGuide>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={showModal}
      transparent
      animationType="none"
      onRequestClose={() => setModal(false)}
      statusBarTranslucent>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <BottomSheet
          ref={bottomSheetRef}
          index={0}
          enablePanDownToClose
          enableDynamicSizing={false}
          snapPoints={['50%', '85%']}
          backdropComponent={backdropProps => (
            <BottomSheetBackdrop
              {...backdropProps}
              disappearsOnIndex={-1}
              appearsOnIndex={0}
              pressBehavior="close"
            />
          )}
          backgroundStyle={{ backgroundColor: colors.surfaceContainerLow }}
          handleIndicatorStyle={{ backgroundColor: colors.outline }}
          onChange={index => {
            if (index === -1) {
              setModal(false);
            }
          }}
          onClose={() => setModal(false)}>
          <TVFocusGuide
            autoFocus={isTV}
            trapFocusLeft={isTV}
            trapFocusRight={isTV}
            trapFocusUp={isTV}
            trapFocusDown={isTV}
            style={{
              backgroundColor: colors.surfaceContainerLow,
              flex: 1,
              paddingHorizontal: 16,
              paddingTop: 8,
            }}>
            {isTV && (
              <SheetButton
                accessibilityLabel="Close downloads"
                hasTVPreferredFocus={loading || streams.length === 0}
                onPress={() => setModal(false)}
                style={{
                  alignSelf: 'flex-end',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  minWidth: 80,
                  marginBottom: 8,
                }}>
                <Text style={{color: colors.onSurface, fontSize: 16}}>Close</Text>
              </SheetButton>
            )}
            {title && (
              <Text
                style={{
                  color: colors.onSurface,
                  fontSize: 20,
                  fontWeight: '700',
                  textAlign: 'center',
                }}>
                {title}
              </Text>
            )}
            {hasSubtitles && (
              <View
                style={{
                  alignSelf: 'center',
                  borderBottomColor: colors.outlineVariant,
                  borderBottomWidth: 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}>
                {([
                  { label: 'Video', value: 1 as const },
                  { label: 'Subtitle', value: 2 as const },
                ] as const).map(tab => {
                  const selected = activeTab === tab.value;
                  return (
                    <SheetButton
                      key={tab.value}
                      accessibilityLabel={`${tab.label} download sources`}
                      hasTVPreferredFocus={tab.value === 1}
                      onPress={() => setActiveTab(tab.value)}
                      style={{
                        borderBottomColor: selected
                          ? colors.primary
                          : 'transparent',
                        borderBottomWidth: 2,
                        marginBottom: -1,
                        paddingHorizontal: 24,
                        paddingVertical: 10,
                      }}>
                      <Text
                        style={{
                          color: selected
                            ? colors.primary
                            : colors.onSurfaceVariant,
                          fontSize: 14,
                          fontWeight: selected ? '700' : '500',
                        }}>
                        {tab.label}
                      </Text>
                    </SheetButton>
                  );
                })}
              </View>
            )}
            <BottomSheetScrollView
              contentContainerStyle={{
                paddingBottom: 36,
                paddingTop: hasSubtitles ? 0 : 12,
              }}
              showsVerticalScrollIndicator={false}>
              {activeTab === 1 ? renderVideoTab() : renderSubtitleTab()}
            </BottomSheetScrollView>
          </TVFocusGuide>
        </BottomSheet>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default DownloadBottomSheet;
