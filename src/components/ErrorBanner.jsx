import React from 'react';
import { AlertTriangle, Key, Zap, ExternalLink } from 'lucide-react';

/**
 * Contextual error banner for OpenRouter errors.
 * Props:
 *   msg            – error message string
 *   code           – optional error code from server: 'AUTH_FAILED' | 'RATE_LIMITED' | ...
 *   onOpenSettings – optional callback to open the settings/key panel
 *   compact        – render a smaller inline variant (for pipeline step errors)
 */
export default function ErrorBanner({ msg, code, onOpenSettings, compact = false }) {
  if (!msg) return null;

  const lower = String(msg).toLowerCase();
  const isAuth =
    code === 'AUTH_FAILED' ||
    lower.includes('401') ||
    lower.includes('invalid api key') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid key') ||
    lower.includes('api key');

  const isQuota =
    code === 'RATE_LIMITED' ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('too many requests');

  if (isAuth) {
    return (
      <div className={`error-banner error-banner--auth${compact ? ' compact' : ''}`}>
        <div className="error-banner-icon"><Key size={compact ? 11 : 14} /></div>
        <div className="error-banner-body">
          <div className="error-banner-title">Invalid API key</div>
          {!compact && (
            <div className="error-banner-sub">
              Your OpenRouter key was rejected. Make sure it starts with{' '}
              <code className="error-banner-code">sk-or-v1-</code> and hasn't been revoked.
            </div>
          )}
          <div className="error-banner-actions">
            {onOpenSettings && (
              <button className="error-banner-btn" onClick={onOpenSettings}>
                Fix in Settings
              </button>
            )}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="error-banner-link"
            >
              openrouter.ai/keys <ExternalLink size={9} />
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (isQuota) {
    return (
      <div className={`error-banner error-banner--quota${compact ? ' compact' : ''}`}>
        <div className="error-banner-icon"><Zap size={compact ? 11 : 14} /></div>
        <div className="error-banner-body">
          <div className="error-banner-title">Rate limit reached</div>
          {!compact && (
            <div className="error-banner-sub">
              Free-tier quota hit or too many requests. Switch to a different free model or wait a
              moment and retry.
            </div>
          )}
          <div className="error-banner-actions">
            {onOpenSettings && (
              <button className="error-banner-btn" onClick={onOpenSettings}>
                Switch Model
              </button>
            )}
            <a
              href="https://openrouter.ai/models?q=free"
              target="_blank"
              rel="noreferrer"
              className="error-banner-link"
            >
              Browse free models <ExternalLink size={9} />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Generic fallback
  return (
    <div className={`error-banner error-banner--generic${compact ? ' compact' : ''}`}>
      <div className="error-banner-icon"><AlertTriangle size={compact ? 11 : 14} /></div>
      <div className="error-banner-body">
        <div className="error-banner-title">{compact ? msg : 'Error'}</div>
        {!compact && <div className="error-banner-sub">{msg}</div>}
      </div>
    </div>
  );
}
