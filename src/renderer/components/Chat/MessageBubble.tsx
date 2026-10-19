import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User } from 'lucide-react';
import type { ChatMessage } from '../../../shared/ipc';
import { CodeBlock } from './CodeBlock';
import { ToolCallCard } from './ToolCallCard';

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isAgent = message.role === 'agent';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-3" data-testid={`system-message-${message.id}`}>
        <div className="px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 flex items-center space-x-2">
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start space-x-3 my-4 ${
        isUser ? 'flex-row-reverse space-x-reverse' : ''
      }`}
      data-testid={`message-${message.role}-${message.id}`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white shadow-sm ${
          isUser
            ? 'bg-indigo-600'
            : 'bg-slate-800 border border-slate-700 text-indigo-400'
        }`}
        aria-hidden="true"
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Message content & tools */}
      <div className={`max-w-[85%] space-y-2.5 ${isUser ? 'text-right' : 'text-left'}`}>
        {/* Chat Bubble */}
        {message.content && (
          <div
            className={`p-4 rounded-2xl text-sm leading-relaxed ${
              isUser
                ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/10 text-left'
                : 'bg-slate-900 border border-slate-800/90 text-slate-200 rounded-tl-none shadow-md'
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose prose-invert max-w-none text-slate-200 text-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeText = String(children).replace(/\n$/, '');
                      const isMultiLine = codeText.includes('\n');

                      if (match || isMultiLine) {
                        return (
                          <CodeBlock
                            language={match ? match[1] : 'text'}
                            value={codeText}
                          />
                        );
                      }
                      return (
                        <code
                          className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-xs"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                    a({ href, children, ...props }) {
                      const handleClick = (e: React.MouseEvent) => {
                        e.preventDefault();
                        if (href && window.api?.system?.openExternal) {
                          window.api.system.openExternal(href).catch((err) => {
                            console.error('Failed to open external link:', err);
                          });
                        }
                      };
                      return (
                        <a
                          href={href}
                          onClick={handleClick}
                          className="text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    },
                    table({ children }) {
                      return (
                        <div className="my-3 overflow-x-auto rounded-xl border border-slate-800">
                          <table className="w-full text-left text-xs border-collapse">
                            {children}
                          </table>
                        </div>
                      );
                    },
                    th({ children }) {
                      return (
                        <th className="p-2.5 bg-slate-800 font-semibold text-slate-200 border-b border-slate-700">
                          {children}
                        </th>
                      );
                    },
                    td({ children }) {
                      return (
                        <td className="p-2.5 bg-slate-900/60 border-b border-slate-800 text-slate-300">
                          {children}
                        </td>
                      );
                    },
                    ul({ children }) {
                      return (
                        <ul className="list-disc list-inside space-y-1 my-2 text-slate-300 text-sm">
                          {children}
                        </ul>
                      );
                    },
                    ol({ children }) {
                      return (
                        <ol className="list-decimal list-inside space-y-1 my-2 text-slate-300 text-sm">
                          {children}
                        </ol>
                      );
                    },
                    blockquote({ children }) {
                      return (
                        <blockquote className="border-l-2 border-indigo-500 pl-3 my-2 text-slate-400 italic">
                          {children}
                        </blockquote>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Embedded Tool Calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2 mt-2 w-full text-left">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
