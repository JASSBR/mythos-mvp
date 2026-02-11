import { io, Socket } from "socket.io-client"

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001/game"

let socket: Socket | null = null

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket
  }

  socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: { token },
  })

  socket.on("connect", () => {
    console.log("[socket] connected:", socket?.id)
  })

  socket.on("disconnect", (reason) => {
    console.log("[socket] disconnected:", reason)
  })

  socket.on("connect_error", (err) => {
    console.error("[socket] connection error:", err.message)
  })

  return socket
}

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}
