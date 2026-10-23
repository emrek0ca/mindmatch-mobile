import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, createThemedStyles } from '../theme/tokens';

export type MenuAnchor = { x: number; y: number };

export type ContextMenuAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onPress: () => void;
};

export function ContextMenu({
  visible,
  anchor,
  actions,
  title,
  detail,
  onClose,
}: {
  visible: boolean;
  anchor: MenuAnchor | null;
  actions: ContextMenuAction[];
  title?: string;
  detail?: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const menuWidth = Math.min(width - 24, 256);
  const maxMenuHeight = Math.max(120, height - insets.top - insets.bottom - 24);
  const menuHeight = Math.min(actions.length * 48 + 12 + (title ? (detail ? 68 : 42) : 0), maxMenuHeight);
  const position = useMemo(() => {
    if (!anchor) return { left: 12, top: insets.top + 8 };
    const left = Math.max(12, Math.min(anchor.x - menuWidth * 0.64, width - menuWidth - 12));
    const top = Math.max(insets.top + 8, Math.min(anchor.y + 8, height - insets.bottom - menuHeight - 8));
    return { left, top };
  }, [anchor, height, insets.bottom, insets.top, menuHeight, menuWidth, width]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Menüyü kapat" style={StyleSheet.absoluteFill} onPress={onClose} />
        <ScrollView style={[styles.menu, { width: menuWidth, height: menuHeight, maxHeight: maxMenuHeight, ...position }]} showsVerticalScrollIndicator={false}>
          {title ? <View style={styles.heading}>
            <Text style={styles.title}>{title}</Text>
            {detail ? <Text style={styles.detail}>{detail}</Text> : null}
          </View> : null}
          {actions.map((action, index) => (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              onPress={action.onPress}
              style={({ pressed }) => [styles.action, index < actions.length - 1 && styles.separator, pressed && styles.pressed]}
            >
              {action.icon ? <View style={styles.icon}>{action.icon}</View> : null}
              <Text style={[styles.label, action.destructive && { color: colors.red }]}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles(colors => ({
  overlay: { flex: 1, backgroundColor: '#00000022' },
  menu: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    shadowColor: colors.night,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 14,
  },
  heading: { paddingHorizontal: 9, paddingTop: 8, paddingBottom: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  title: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  action: { minHeight: 48, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 12 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  icon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '600' },
  pressed: { backgroundColor: colors.canvas },
}));
