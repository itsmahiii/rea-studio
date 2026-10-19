import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Session, SessionMetadata, ChatMessage, ToolCall } from '../../shared/ipc';

function getUserDataPath(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // fallback outside electron process
  }
  return process.env.APPDATA
    ? path.join(process.env.APPDATA, 'rea-studio')
    : path.join(process.cwd(), '.rea-data');
}

export class SessionService {
  private sessionsFile: string;
  private sessions = new Map<string, Session>();

  constructor() {
    this.sessionsFile = path.join(getUserDataPath(), 'rea_sessions.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.sessionsFile)) {
        const raw = fs.readFileSync(this.sessionsFile, 'utf-8');
        const list: Session[] = JSON.parse(raw);
        for (const s of list) {
          this.sessions.set(s.id, s);
        }
      }
    } catch (err) {
      console.error('Failed to load sessions from disk:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const list = Array.from(this.sessions.values());
      fs.mkdirSync(path.dirname(this.sessionsFile), { recursive: true });
      fs.writeFileSync(this.sessionsFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save sessions to disk:', err);
    }
  }

  public list(): SessionMetadata[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      title: s.title,
      targetPath: s.target.path,
      targetName: s.target.name,
      targetType: s.target.targetType,
      provider: s.provider,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
    })).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public get(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  public create(targetPath: string, targetName: string, targetType: string, provider?: string): Session {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const providerNotice = provider ? ` [Provider: ${provider}]` : '';
    const session: Session = {
      id,
      title: `Analysis of ${targetName}`,
      target: {
        path: targetPath,
        name: targetName,
        isDirectory: false,
        targetType,
        exists: true,
      },
      provider,
      messages: [
        {
          id: crypto.randomUUID(),
          sessionId: id,
          role: 'system',
          content: `Initialized session for target: **${targetName}** (${targetType})${providerNotice}\nReady to investigate with REA MCP tools.`,
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    this.saveToDisk();
    return session;
  }

  public addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const fullMessage: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    session.messages.push(fullMessage);
    session.updatedAt = fullMessage.timestamp;
    this.saveToDisk();
    return fullMessage;
  }

  public addToolCall(sessionId: string, messageId: string, toolCall: ToolCall): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const message = session.messages.find((m) => m.id === messageId);
    if (!message) return false;

    if (!message.toolCalls) {
      message.toolCalls = [];
    }
    message.toolCalls.push(toolCall);
    session.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return true;
  }

  public delete(sessionId: string): boolean {
    const existed = this.sessions.delete(sessionId);
    if (existed) {
      this.saveToDisk();
    }
    return existed;
  }

  public clearAll(): boolean {
    this.sessions.clear();
    try {
      if (fs.existsSync(this.sessionsFile)) {
        fs.unlinkSync(this.sessionsFile);
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const sessionService = new SessionService();
