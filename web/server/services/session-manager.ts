import { v4 as uuidv4 } from 'uuid';
import { WizardSession, WizardStep } from '../../shared/types/api';

export class SessionManager {
  private sessions = new Map<string, WizardSession>();
  
  constructor() {
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }
  
  createSession(userId?: string): string {
    const sessionId = uuidv4();
    const session: WizardSession = {
      id: sessionId,
      userId,
      currentStep: 'authentication',
      createdAt: new Date(),
      updatedAt: new Date(),
      completed: false
    };
    
    this.sessions.set(sessionId, session);
    return sessionId;
  }
  
  getSession(sessionId: string): WizardSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  updateSession(sessionId: string, updates: Partial<WizardSession>): WizardSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    
    const updatedSession: WizardSession = {
      ...session,
      ...updates,
      updatedAt: new Date()
    };
    
    this.sessions.set(sessionId, updatedSession);
    return updatedSession;
  }
  
  updateSessionStep(sessionId: string, step: WizardStep): WizardSession | null {
    return this.updateSession(sessionId, { currentStep: step });
  }
  
  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
  
  getAllSessions(userId?: string): WizardSession[] {
    const allSessions = Array.from(this.sessions.values());
    if (userId) {
      return allSessions.filter(session => session.userId === userId);
    }
    return allSessions;
  }
  
  getSessionStats(): {
    total: number;
    active: number;
    completed: number;
    byStep: Record<WizardStep, number>;
  } {
    const allSessions = Array.from(this.sessions.values());
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const active = allSessions.filter(s => s.updatedAt > oneHourAgo && !s.completed);
    const completed = allSessions.filter(s => s.completed);
    
    const byStep: Record<WizardStep, number> = {
      authentication: 0,
      discovery: 0,
      selection: 0,
      configuration: 0,
      preview: 0,
      execution: 0,
      results: 0
    };
    
    allSessions.forEach(session => {
      byStep[session.currentStep]++;
    });
    
    return {
      total: allSessions.length,
      active: active.length,
      completed: completed.length,
      byStep
    };
  }
  
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours
    
    let cleanedCount = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.updatedAt < expiredThreshold) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }
}