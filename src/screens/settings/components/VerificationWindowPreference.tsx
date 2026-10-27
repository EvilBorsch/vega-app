import React, {useCallback, useState} from 'react';
import {View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {settingsStorage, type VerificationWindowPolicy} from '../../../lib/storage/SettingsStorage';
import {useM3Colors} from '../../../theme/M3PaletteContext';
import MaterialDialogSurface from '../../../components/ui/MaterialDialogSurface';
import SettingsRow from '../../../components/ui/SettingsRow';
import AppText from '../../../components/ui/Text';
import {TVFocusable} from '../../../components/tv';

const choices: {value: VerificationWindowPolicy; label: string; description: string}[] = [
  {value: 'ask', label: 'Ask each time', description: 'Ask before a provider opens its website. Recommended.'},
  {value: 'allow', label: 'Always allow', description: 'Allow websites to open without asking.'},
  {value: 'block', label: 'Block', description: 'Prevent provider websites from opening. Some providers may not work.'},
];

export default function VerificationWindowPreference() {
  const colors = useM3Colors();
  const [policy, setPolicy] = useState(() => settingsStorage.getVerificationWindowPolicy());
  const [open, setOpen] = useState(false);
  useFocusEffect(useCallback(() => {setPolicy(settingsStorage.getVerificationWindowPolicy());}, []));
  return <>
    <SettingsRow title="Provider verification windows" icon="open-in-new" divider={false}
      description={`${choices.find(choice => choice.value === policy)?.label}. Controls website windows for all providers.`}
      onPress={() => {setPolicy(settingsStorage.getVerificationWindowPolicy()); setOpen(true);}} />
    {open ? <MaterialDialogSurface visible onDismiss={() => setOpen(false)}>
      <AppText role="titleLarge" style={{color: colors.onSurface, marginBottom: 16}}>Provider verification windows</AppText>
      <View style={{gap: 8}}>
        {choices.map(choice => <TVFocusable key={choice.value} registerScreenFocus={false}
          hasTVPreferredFocus={policy === choice.value} accessibilityRole="radio"
          accessibilityLabel={choice.label} accessibilityState={{checked: policy === choice.value}}
          borderRadius={12} onPress={() => {
            settingsStorage.setVerificationWindowPolicy(choice.value);
            setPolicy(choice.value); setOpen(false);
          }} style={{flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12,
            backgroundColor: policy === choice.value ? colors.secondaryContainer : colors.surfaceContainerHighest}}>
          <MaterialIcons name={policy === choice.value ? 'radio-button-checked' : 'radio-button-unchecked'} size={24} color={colors.primary} />
          <View style={{flex: 1}}>
            <AppText role="bodyLarge" style={{color: colors.onSurface}}>{choice.label}</AppText>
            <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 4}}>{choice.description}</AppText>
          </View>
        </TVFocusable>)}
      </View>
    </MaterialDialogSurface> : null}
  </>;
}
