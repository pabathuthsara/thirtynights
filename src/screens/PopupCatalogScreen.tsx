import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { Screen, Stagger } from '@/components/Screen';
import { popupDefinitions, type PopupDefinition } from '@/data/popups';
import { colors, radii, shadows, textStyles, typography, weight } from '@/theme';

export function PopupCatalogScreen({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<PopupDefinition | null>(null);

  return (
    <Screen header={<AppHeader label="PREVIEW" onBack={onBack} />}>
      <Stagger index={0}>
        <Text accessibilityRole="header" style={styles.title}>Supporting states</Text>
        <Text style={styles.body}>
          All twenty-five specified moments are represented here. Full-screen, caption, and automatic states are labelled by behavior.
        </Text>
      </Stagger>

      <Stagger index={1}>
        <View style={styles.list}>
          {popupDefinitions.map((popup, index) => (
            <Pressable
              key={popup.id}
              accessibilityRole="button"
              accessibilityLabel={`${popup.title}. ${popup.trigger}`}
              onPress={() => setSelected(popup)}
              style={({ pressed }) => [
                styles.row,
                index === popupDefinitions.length - 1 && styles.lastRow,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.id}>{popup.id}</Text>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>{popup.title}</Text>
                <Text style={styles.trigger}>
                  {popup.trigger}{popup.behavior && popup.behavior !== 'sheet' ? ` · ${popup.behavior}` : ''}
                </Text>
              </View>
              <ChevronRight size={17} strokeWidth={2} color={colors.boneFaint} />
            </Pressable>
          ))}
        </View>
      </Stagger>

      <BottomSheet
        visible={Boolean(selected)}
        title={selected?.title ?? ''}
        body={selected?.body}
        actions={(selected?.actions.length ? selected.actions : ['Close']).map((label) => ({
          label,
          variant: /delete|leave|sign out/i.test(label) ? 'ember' as const : label === selected?.actions[0] ? 'bone' as const : 'outline' as const,
          onPress: () => setSelected(null),
        }))}
        onClose={() => setSelected(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...textStyles.title },
  body: { ...textStyles.bodySmall, marginTop: 10 },
  list: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,253,249,0.86)',
    ...shadows.soft,
    shadowOpacity: 0.07,
  },
  row: {
    minHeight: 64,
    paddingHorizontal: 15,
    paddingVertical: 10,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  lastRow: { borderBottomWidth: 0 },
  pressed: { backgroundColor: 'rgba(190,111,124,0.06)' },
  id: {
    width: 34,
    color: colors.brassText,
    fontFamily: typography.monoMedium,
    fontSize: 12,
  },
  copy: { flex: 1 },
  rowTitle: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 16,
  },
  trigger: {
    ...textStyles.caption,
    color: colors.boneFaint,
    fontWeight: weight.medium,
    marginTop: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
