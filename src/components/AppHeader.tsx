import { StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Settings, Share2 } from 'lucide-react-native';

import { IconButton } from '@/components/Buttons';
import { Sparkle } from '@/components/Sparkle';
import { colors, HIT_TARGET, night as nightTheme, textStyles } from '@/theme';

export function AppHeader({ label, onBack, onSettings, onShare, paper = false, compact = false, night = false }: {
  label?: string;
  onBack?: () => void;
  onSettings?: () => void;
  onShare?: () => void;
  paper?: boolean;
  compact?: boolean;
  /** Rendered over the nightfall atmosphere. */
  night?: boolean;
}) {
  const rightCount = (onSettings ? 1 : 0) + (onShare ? 1 : 0);
  // Both flanks reserve the same width so the title stays optically centred,
  // and the reservation grows with the number of buttons actually rendered.
  const flank = Math.max(1, rightCount, onBack ? 1 : 0) * (HIT_TARGET + 8);

  return (
    <View style={[styles.header, compact && styles.compactHeader]}>
      <View style={[styles.side, { width: flank }]}>
        {onBack ? <IconButton icon={ArrowLeft} onPress={onBack} paper={paper} night={night} label="Go back" /> : null}
      </View>
      {label ? (
        <View style={styles.center}>
          <Sparkle size={11} color={night ? nightTheme.candle : colors.brass} />
          <Text numberOfLines={1} style={[textStyles.eyebrow, styles.label, paper && styles.paperLabel, night && styles.nightLabel]}>{label}</Text>
          <Sparkle size={11} color={night ? nightTheme.candle : colors.brass} />
        </View>
      ) : <View style={styles.center} />}
      <View style={[styles.side, styles.right, { width: flank }]}>
        {onShare ? <IconButton icon={Share2} onPress={onShare} paper={paper} night={night} label="Share" /> : null}
        {onSettings ? <IconButton icon={Settings} onPress={onSettings} paper={paper} night={night} label="Open settings" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: HIT_TARGET + 8,
    marginHorizontal: -2,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactHeader: {
    minHeight: HIT_TARGET,
    marginBottom: 4,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  right: {
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  label: {
    textAlign: 'center',
    fontSize: 11,
    letterSpacing: 1.9,
    color: colors.boneDim,
  },
  paperLabel: {
    color: colors.paperDim,
  },
  nightLabel: {
    color: nightTheme.textDim,
  },
});
