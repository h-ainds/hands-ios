import { useState, useEffect } from 'react'
import { View, Text, Pressable, FlatList, Modal, StyleSheet } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'expo-router'

interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface ChatHistorySheetProps {
  userId: string | null
  isOpen: boolean
  onClose: () => void
}

export default function ChatHistorySheet({
  userId,
  isOpen,
  onClose,
}: ChatHistorySheetProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (isOpen && userId) {
      loadConversations()
    }
  }, [isOpen, userId])

  const loadConversations = async () => {
    if (!userId) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (!error) {
        setConversations(data || [])
      }
    } catch (error) {
      console.error('Error loading conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  const handleSelectConversation = (id: string) => {
    onClose()
    router.push(`/ask?conversationId=${id}`)
  }

  const handleNewChat = () => {
    onClose()
    router.push('/ask')
  }

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chat History</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <SymbolView name="xmark" size={24} tintColor="#000000" />
            </Pressable>
          </View>

          {/* New Chat Button */}
          <Pressable
            onPress={handleNewChat}
            style={styles.newChatButton}
          >
            <SymbolView name="plus" size={20} tintColor="#FFFFFF" />
            <Text style={styles.newChatText}>New Chat</Text>
          </Pressable>

          {/* Conversations List */}
          {loading ? (
            <Text style={styles.emptyText}>Loading...</Text>
          ) : conversations.length === 0 ? (
            <Text style={styles.emptyText}>No conversations yet</Text>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelectConversation(item.id)}
                  style={styles.conversationItem}
                >
                  <SymbolView name="message" size={18} tintColor="#666666" />
                  <View style={styles.conversationContent}>
                    <Text style={styles.conversationTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.conversationDate}>
                      {formatDate(item.updated_at)}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '70%',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  newChatButton: {
    backgroundColor: '#6CD401',
    padding: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  newChatText: {
    color: '#FFF',
    marginLeft: 8,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
  conversationItem: {
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  conversationContent: {
    marginLeft: 12,
    flex: 1,
  },
  conversationTitle: {
    fontWeight: '600',
    fontSize: 14,
  },
  conversationDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
})