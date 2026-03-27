import React, { useState, useRef, useEffect } from 'react';

const Chat = ({ messages, sendMessage, username, onClose }) => {
    const [input, setInput] = useState('');
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        const text = input.trim();
        if (text) {
            sendMessage(text);
            setInput('');
        }
    };

    return (
        <div className="chat-panel">
            <div className="chat-header">
                <div className="chat-header-info">
                    <h3 className="chat-title">Messages</h3>
                    <p className="chat-subtitle">Chat Here  </p>
                </div>
                {onClose && (
                    <button className="drawer-close-btn" onClick={onClose}>✕</button>
                )}
            </div>

            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="chat-empty">
                        <div className="chat-empty-icon">🎶</div>
                        <p>No messages yet</p>
                        <p className="chat-empty-hint">Say something while the music plays</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMine = msg.username.toLowerCase() === username.toLowerCase();
                        return (
                            <div
                                key={msg.id}
                                className={`chat-bubble-wrapper ${isMine ? 'bubble-mine-wrap' : 'bubble-theirs-wrap'}`}
                            >
                                {!isMine && <span className="bubble-sender">{msg.username}</span>}
                                <div className={`chat-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'}`}>
                                    {msg.text}
                                </div>
                                <span className="bubble-time">{msg.time}</span>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            <div className="chat-input-area">
                <input
                    className="chat-input"
                    placeholder="Say something..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    maxLength={200}
                />
                <button
                    className="chat-send-btn"
                    onClick={handleSend}
                    disabled={!input.trim()}
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default Chat;
