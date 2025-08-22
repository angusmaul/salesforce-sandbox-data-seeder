import { SocketService } from '../services/socket';
import { SessionManager } from '../services/session-manager';

declare global {
  namespace Express {
    interface Request {
      socketService: SocketService;
      sessionManager: SessionManager;
    }
  }
}