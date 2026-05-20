import React, { createContext, useContext, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';
import { SOCKET_URL } from '../config/api';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user, token } = useContext(AuthContext);
  const socket = useRef(null);

  useEffect(() => {
    if (!user?._id || !token) {
      socket.current?.disconnect();
      socket.current = null;
      return undefined;
    }

    const currentSocket = io(SOCKET_URL, {
      withCredentials: false,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      auth: { token: `Bearer ${token}` },
    });

    socket.current = currentSocket;

    return () => {
      currentSocket.disconnect();
      if (socket.current === currentSocket) {
        socket.current = null;
      }
    };
  }, [user?._id, token]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
