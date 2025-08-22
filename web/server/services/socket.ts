import { Server as SocketIOServer } from 'socket.io';
import { ProgressUpdate, WizardStep } from '../../shared/types/api';

export class SocketService {
  private io: SocketIOServer;
  
  constructor(io: SocketIOServer) {
    this.io = io;
  }
  
  /**
   * Send progress update to a specific session
   */
  sendProgress(sessionId: string, step: WizardStep, progress: number, message: string, data?: any): void {
    const update: ProgressUpdate = {
      sessionId,
      step,
      progress,
      message,
      data
    };
    
    this.io.to(sessionId).emit('progress', update);
  }
  
  /**
   * Send step completion notification
   */
  sendStepComplete(sessionId: string, step: WizardStep, data?: any): void {
    this.io.to(sessionId).emit('step-complete', {
      sessionId,
      step,
      data
    });
  }
  
  /**
   * Send error notification
   */
  sendError(sessionId: string, error: string, step?: WizardStep): void {
    this.io.to(sessionId).emit('error', {
      sessionId,
      error,
      step,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Send discovery progress update
   */
  sendDiscoveryProgress(sessionId: string, discovered: number, total: number, currentObject?: string): void {
    this.sendProgress(
      sessionId,
      'discovery',
      Math.round((discovered / total) * 100),
      currentObject ? `Discovering ${currentObject}...` : `Discovered ${discovered} of ${total} objects`,
      { discovered, total, currentObject }
    );
  }
  
  /**
   * Send data generation progress
   */
  sendGenerationProgress(sessionId: string, objectName: string, generated: number, total: number): void {
    this.sendProgress(
      sessionId,
      'execution',
      Math.round((generated / total) * 100),
      `Generating ${objectName} records: ${generated}/${total}`,
      { objectName, generated, total }
    );
  }
  
  /**
   * Send data loading progress
   */
  sendLoadingProgress(
    sessionId: string, 
    objectName: string, 
    loaded: number, 
    total: number, 
    successful: number,
    failed: number
  ): void {
    this.sendProgress(
      sessionId,
      'execution',
      Math.round((loaded / total) * 100),
      `Loading ${objectName}: ${successful} successful, ${failed} failed`,
      { objectName, loaded, total, successful, failed }
    );
  }
  
  /**
   * Send log message to session
   */
  sendLog(sessionId: string, level: 'info' | 'warn' | 'error' | 'success', message: string, data?: any): void {
    this.io.to(sessionId).emit('log', {
      sessionId,
      level,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Send real-time data preview
   */
  sendDataPreview(sessionId: string, objectName: string, sampleRecords: any[]): void {
    this.io.to(sessionId).emit('data-preview', {
      sessionId,
      objectName,
      sampleRecords,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Send storage usage update
   */
  sendStorageUpdate(sessionId: string, storageInfo: any): void {
    this.io.to(sessionId).emit('storage-update', {
      sessionId,
      storageInfo,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast system notification to all connected clients
   */
  broadcastSystemNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    this.io.emit('system-notification', {
      message,
      type,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Get connection stats
   */
  getConnectionStats(): {
    totalConnections: number;
    activeRooms: string[];
  } {
    const totalConnections = this.io.sockets.sockets.size;
    const activeRooms = Array.from(this.io.sockets.adapter.rooms.keys())
      .filter(room => room.length === 36); // Filter for UUID-like session IDs
    
    return {
      totalConnections,
      activeRooms
    };
  }
}