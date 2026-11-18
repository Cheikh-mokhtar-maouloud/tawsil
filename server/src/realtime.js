// مرجع مشترك لـ Socket.io حتى تستطيع المسارات إرسال الأحداث
let io = null;

export const setIo = (instance) => {
  io = instance;
};

export const emitToUser = (userId, event, data) => io?.to(`user:${userId}`).emit(event, data);
export const emitToOrder = (orderId, event, data) => io?.to(`order:${orderId}`).emit(event, data);
export const emitToAdmins = (event, data) => io?.to('admins').emit(event, data);

export const isUserOnline = (userId) => Boolean(io?.sockets.adapter.rooms.get(`user:${userId}`)?.size);
