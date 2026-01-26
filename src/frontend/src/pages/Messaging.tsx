import React, { useState, useEffect } from 'react'
import { useOffline } from '../contexts/OfflineContext'
import './Messaging.css'

interface Message {
  id: string
  senderId: string
  senderName: string
  content: string
  originalLanguage: string
  translatedContent?: string
  timestamp: Date
  messageType: 'text' | 'price_quote' | 'negotiation_offer'
}

interface Conversation {
  id: string
  participants: string[]
  lastMessage: Message
  unreadCount: number
}

const Messaging: React.FC = () => {
  const { isOnline, getOfflineData, saveOfflineData } = useOffline()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    console.log('Messaging: Component mounted, loading conversations...')
    loadConversations()
  }, [isOnline])

  const loadConversations = async () => {
    console.log('Messaging: loadConversations called, isOnline:', isOnline)
    
    // Always set mock conversations as fallback
    const mockConversations = [
      {
        id: 'conv-1',
        participants: ['Rajesh Kumar'],
        lastMessage: {
          id: 'last-1',
          senderId: 'vendor-1',
          senderName: 'Rajesh Kumar',
          content: 'What is your best price for 500kg rice?',
          originalLanguage: 'en',
          timestamp: new Date(Date.now() - 30 * 60 * 1000),
          messageType: 'text' as const
        },
        unreadCount: 1
      },
      {
        id: 'conv-2',
        participants: ['Priya Sharma'],
        lastMessage: {
          id: 'last-2',
          senderId: 'vendor-2',
          senderName: 'Priya Sharma',
          content: 'Cotton quality looks good. Can we negotiate?',
          originalLanguage: 'en',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          messageType: 'text' as const
        },
        unreadCount: 0
      },
      {
        id: 'conv-3',
        participants: ['Mohammed Ali'],
        lastMessage: {
          id: 'last-3',
          senderId: 'vendor-3',
          senderName: 'Mohammed Ali',
          content: 'Thank you for the wheat. Transaction completed.',
          originalLanguage: 'en',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          messageType: 'text' as const
        },
        unreadCount: 0
      }
    ]

    try {
      if (isOnline) {
        // Get auth token from localStorage
        const token = localStorage.getItem('accessToken')
        console.log('Messaging: Token found:', !!token)
        
        if (!token) {
          console.log('Messaging: No auth token found, using mock conversations')
          setConversations(mockConversations)
          saveOfflineData('conversations', mockConversations)
          return
        }

        const response = await fetch('/api/v1/communication/conversations', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        
        console.log('Messaging: API response status:', response.status)
        
        if (response.ok) {
          const data = await response.json()
          console.log('Messaging: API data received:', data)
          
          // Transform the API response to match our interface
          const transformedConversations = data.data?.map((conv: any) => ({
            id: conv.id,
            participants: conv.participants?.map((p: any) => p.name) || [],
            lastMessage: {
              id: 'last',
              senderId: conv.lastMessage?.senderId || '',
              senderName: conv.lastMessage?.senderId || 'Unknown',
              content: conv.lastMessage?.content || '',
              originalLanguage: 'en',
              timestamp: new Date(conv.lastMessage?.timestamp || Date.now()),
              messageType: 'text' as const
            },
            unreadCount: 0
          })) || []
          
          // Use API data if available, otherwise fallback to mock
          const conversationsToUse = transformedConversations.length > 0 ? transformedConversations : mockConversations
          console.log('Messaging: Setting conversations:', conversationsToUse.length)
          setConversations(conversationsToUse)
          saveOfflineData('conversations', conversationsToUse)
        } else {
          console.error('Messaging: API request failed:', response.status)
          // Fallback to mock conversations
          console.log('Messaging: Using mock conversations due to API failure')
          setConversations(mockConversations)
          saveOfflineData('conversations', mockConversations)
        }
      } else {
        const cached = getOfflineData('conversations') || mockConversations
        console.log('Messaging: Using cached/mock conversations:', cached.length)
        setConversations(cached)
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
      // Always fallback to mock conversations
      console.log('Messaging: Using mock conversations due to error')
      setConversations(mockConversations)
      saveOfflineData('conversations', mockConversations)
    }
  }

  const loadMessages = async (conversationId: string) => {
    setLoading(true)
    console.log('Messages: loadMessages called for conversation:', conversationId)
    
    // Always set mock messages as fallback
    const mockMessages = [
      {
        id: 'msg-1',
        senderId: 'vendor-1',
        senderName: 'Rajesh Kumar',
        content: 'Hello, I have rice for sale',
        originalLanguage: 'en',
        timestamp: new Date(Date.now() - 60 * 60 * 1000),
        messageType: 'text' as const
      },
      {
        id: 'msg-2',
        senderId: 'current-user',
        senderName: 'You',
        content: 'What is your best price for 500kg?',
        originalLanguage: 'en',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        messageType: 'text' as const
      },
      {
        id: 'msg-3',
        senderId: 'vendor-1',
        senderName: 'Rajesh Kumar',
        content: 'I can offer ₹1950 per kg for good quality rice',
        originalLanguage: 'en',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        messageType: 'text' as const
      }
    ]

    try {
      if (isOnline) {
        // Get auth token from localStorage
        const token = localStorage.getItem('accessToken')
        console.log('Messages: Token found:', !!token)
        
        if (!token) {
          console.log('Messages: No auth token found, using mock messages')
          setMessages(mockMessages)
          saveOfflineData(`messages_${conversationId}`, mockMessages)
          setLoading(false)
          return
        }

        const response = await fetch(`/api/v1/communication/sessions/${conversationId}/messages`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        
        console.log('Messages: API response status:', response.status)
        
        if (response.ok) {
          const data = await response.json()
          console.log('Messages: API data received:', data)
          
          // Transform the API response to match our interface
          const transformedMessages = data.data?.map((msg: any) => ({
            id: msg.id,
            senderId: msg.senderId,
            senderName: msg.senderId === 'current-user' ? 'You' : 'Other',
            content: msg.content,
            originalLanguage: msg.originalLanguage || 'en',
            translatedContent: msg.translations?.en,
            timestamp: new Date(msg.timestamp),
            messageType: msg.messageType || 'text'
          })) || []
          
          // Use API data if available, otherwise fallback to mock
          const messagesToUse = transformedMessages.length > 0 ? transformedMessages : mockMessages
          console.log('Messages: Setting messages:', messagesToUse.length)
          setMessages(messagesToUse)
          saveOfflineData(`messages_${conversationId}`, messagesToUse)
        } else {
          console.error('Messages: API request failed:', response.status)
          // Fallback to mock messages
          console.log('Messages: Using mock messages due to API failure')
          setMessages(mockMessages)
          saveOfflineData(`messages_${conversationId}`, mockMessages)
        }
      } else {
        const cached = getOfflineData(`messages_${conversationId}`) || mockMessages
        console.log('Messages: Using cached/mock messages:', cached.length)
        setMessages(cached)
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
      // Always fallback to mock messages
      console.log('Messages: Using mock messages due to error')
      setMessages(mockMessages)
      saveOfflineData(`messages_${conversationId}`, mockMessages)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return

    const tempMessage: Message = {
      id: Date.now().toString(),
      senderId: 'current-user',
      senderName: 'You',
      content: newMessage,
      originalLanguage: 'en',
      timestamp: new Date(),
      messageType: 'text'
    }

    // Optimistically add message
    setMessages(prev => [...prev, tempMessage])
    setNewMessage('')

    try {
      if (isOnline) {
        const response = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: selectedConversation,
            content: newMessage,
            messageType: 'text'
          })
        })

        if (response.ok) {
          const data = await response.json()
          // Update with server response
          setMessages(prev => 
            prev.map(msg => msg.id === tempMessage.id ? data.message : msg)
          )
        }
      } else {
        // Store for later sync
        const pendingMessages = getOfflineData('pendingMessages') || []
        pendingMessages.push({
          conversationId: selectedConversation,
          content: newMessage,
          timestamp: new Date()
        })
        saveOfflineData('pendingMessages', pendingMessages)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      // Keep optimistic update in offline mode
    }
  }

  const handleConversationSelect = (conversationId: string) => {
    setSelectedConversation(conversationId)
    loadMessages(conversationId)
  }

  const formatTime = (timestamp: Date) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className="messaging">
      <div className="messaging-layout">
        {/* Conversations List */}
        <div className="conversations-panel">
          <div className="panel-header">
            <h2>Messages</h2>
            {!isOnline && <span className="offline-badge">Offline</span>}
          </div>
          
          <div className="conversations-list">
            {conversations.length > 0 ? (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={`conversation-item ${selectedConversation === conversation.id ? 'active' : ''}`}
                  onClick={() => handleConversationSelect(conversation.id)}
                >
                  <div className="conversation-avatar">
                    {conversation.participants[0]?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="conversation-content">
                    <div className="conversation-header">
                      <span className="participant-name">
                        {conversation.participants[0] || 'Unknown'}
                      </span>
                      <span className="last-time">
                        {formatTime(conversation.lastMessage.timestamp)}
                      </span>
                    </div>
                    <div className="last-message">
                      {conversation.lastMessage.content}
                    </div>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <div className="unread-badge">
                      {conversation.unreadCount}
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="empty-conversations">
                <p>No conversations yet</p>
                <p>Start trading to begin messaging</p>
              </div>
            )}
          </div>
        </div>

        {/* Messages Panel */}
        <div className="messages-panel">
          {selectedConversation ? (
            <>
              <div className="messages-header">
                <h3>Conversation</h3>
                {!isOnline && (
                  <span className="offline-warning">
                    Messages will sync when online
                  </span>
                )}
              </div>

              <div className="messages-container">
                {loading ? (
                  <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading messages...</p>
                  </div>
                ) : (
                  <div className="messages-list">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`message ${message.senderId === 'current-user' ? 'sent' : 'received'}`}
                      >
                        <div className="message-content">
                          <div className="message-text">
                            {message.content}
                          </div>
                          {message.translatedContent && (
                            <div className="translated-text">
                              <small>Translated: {message.translatedContent}</small>
                            </div>
                          )}
                        </div>
                        <div className="message-meta">
                          <span className="message-time">
                            {formatTime(message.timestamp)}
                          </span>
                          {message.originalLanguage !== 'en' && (
                            <span className="language-tag">
                              {message.originalLanguage.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="message-input-container">
                <div className="message-input-group">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="message-input"
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <button
                    onClick={sendMessage}
                    className="send-button"
                    disabled={!newMessage.trim()}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="no-conversation-selected">
              <h3>Select a conversation</h3>
              <p>Choose a conversation from the list to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Messaging