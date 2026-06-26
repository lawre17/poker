import React, { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from './theme';
import type { ChatMsg } from './useOnlineGame';

// Ludo-style quick messages: tap to send instantly, no keyboard needed.
const PRESETS = [
  'Hi! 👋',
  'Nice move! 👏',
  'Good game!',
  'Hurry up! ⏳',
  'Oh no! 😅',
  'Lucky! 🍀',
  'Well played 🤝',
  '😂',
  '🔥',
  '👍',
  '😮',
  '😎',
];

interface Props {
  messages: ChatMsg[];
  unread: number;
  onSend: (text: string) => void;
  /** Called when the panel opens, so unread can be cleared. */
  onOpened: () => void;
}

/**
 * Floating chat button (bottom-right) + slide-up panel. Combines Ludo-style
 * quick presets with a free-text box, and a scrollback of recent messages.
 */
export function ChatPanel({ messages, unread, onSend, onOpened }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const openPanel = () => {
    setOpen(true);
    onOpened();
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  // Inverted list keeps the newest message pinned to the bottom without manual
  // scrolling, so we feed it newest-first.
  const reversed = [...messages].reverse();

  return (
    <>
      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable style={styles.fab} onPress={openPanel} hitSlop={10}>
          <Text style={styles.fabIcon}>💬</Text>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Chat</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            <FlatList
              data={reversed}
              inverted
              keyExtractor={(m) => m.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.bubble,
                    item.self ? styles.bubbleSelf : styles.bubbleOther,
                  ]}
                >
                  {!item.self && (
                    <Text style={styles.bubbleName}>{item.fromName}</Text>
                  )}
                  <Text style={styles.bubbleText}>{item.text}</Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>No messages yet — say hi! 👋</Text>
              }
            />

            <View style={styles.presetsRow}>
              <FlatList
                horizontal
                data={PRESETS}
                keyExtractor={(p) => p}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.presetsContent}
                renderItem={({ item }) => (
                  <Pressable style={styles.preset} onPress={() => send(item)}>
                    <Text style={styles.presetText}>{item}</Text>
                  </Pressable>
                )}
              />
            </View>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message…"
                placeholderTextColor={colors.textMuted}
                maxLength={200}
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={() => send(draft)}
              />
              <Pressable
                style={[styles.sendBtn, !draft.trim() && styles.sendBtnOff]}
                onPress={() => send(draft)}
                disabled={!draft.trim()}
              >
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabWrap: { position: 'absolute', right: 16, bottom: 28 },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.feltDark,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: { fontSize: 24 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.feltDark,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 16,
    maxHeight: '72%',
    borderTopWidth: 2,
    borderColor: colors.gold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  title: { color: colors.gold, fontWeight: '800', fontSize: 18 },
  close: { color: colors.text, fontWeight: '800', fontSize: 18 },

  list: { paddingHorizontal: 12 },
  listContent: { paddingVertical: 8, gap: 8 },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
    transform: [{ scaleY: -1 }], // counter the inverted list
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleSelf: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.feltLight,
    borderBottomLeftRadius: 4,
  },
  bubbleName: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 2,
  },
  bubbleText: { color: colors.text, fontSize: 15 },

  presetsRow: { paddingVertical: 8 },
  presetsContent: { paddingHorizontal: 12, gap: 8 },
  preset: {
    backgroundColor: colors.felt,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.feltLight,
  },
  presetText: { color: colors.text, fontWeight: '600', fontSize: 14 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    backgroundColor: colors.felt,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.feltLight,
  },
  sendBtn: {
    backgroundColor: colors.gold,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  sendBtnOff: { opacity: 0.5 },
  sendText: { color: colors.feltDark, fontWeight: '800', fontSize: 15 },
});
