import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export function useWebSocket(url: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  
  useEffect(() => {
    if (!url) return;
    
    // Create socket connection
    const newSocket = io(url, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      retries: 3
    });
    
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
    });
    
    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setConnected(false);
    });
    
    socketRef.current = newSocket;
    setSocket(newSocket);
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setConnected(false);
    };
  }, [url]);
  
  return socket;
}