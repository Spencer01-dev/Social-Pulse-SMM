import React, { useEffect, useState } from 'react';
import { X, MessageCircle, ExternalLink, Users, Bell, Zap } from 'lucide-react';

const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb8hsFI1SWstSgF0M31m';
const STORAGE_KEY = 'sp_whatsapp_popup_dismissed';
const DISMISS_HOURS = 24;

export const WhatsAppChannelPopup: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const hoursSince = (Date.now() - dismissedAt) / (1000 * 60 * 60);
      if (hoursSince < DISMISS_HOURS) return;
    }
    // Show popup after a short delay for better UX
    const timer = setTimeout(() => {
      setVisible(true);
      requestAnimationFrame(() => setAnimateIn(true));
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setAnimateIn(false);
    setTimeout(() => {
      setVisible(false);
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }, 350);
  };

  const handleJoin = () => {
    window.open(WHATSAPP_CHANNEL_URL, '_blank', 'noopener,noreferrer');
    handleDismiss();
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleDismiss}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: animateIn ? 1 : 0,
          transition: 'opacity 0.35s ease',
        }}
      />

      {/* Popup */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            width: '100%',
            maxWidth: '420px',
            background: 'linear-gradient(145deg, rgba(30, 35, 50, 0.97), rgba(18, 22, 36, 0.99))',
            border: '1px solid rgba(37, 211, 102, 0.25)',
            borderRadius: '20px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(37, 211, 102, 0.12)',
            overflow: 'hidden',
            transform: animateIn ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)',
            opacity: animateIn ? 1 : 0,
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Green accent bar */}
          <div
            style={{
              height: '4px',
              background: 'linear-gradient(90deg, #25D366, #128C7E, #25D366)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite',
            }}
          />

          {/* Close button */}
          <button
            onClick={handleDismiss}
            style={{
              position: 'absolute',
              top: '14px',
              right: '14px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '6px',
              cursor: 'pointer',
              color: 'rgba(255, 255, 255, 0.5)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
            }}
          >
            <X size={16} />
          </button>

          {/* Content */}
          <div style={{ padding: '28px 24px 24px' }}>
            {/* Icon */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #25D366, #128C7E)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
                boxShadow: '0 8px 24px rgba(37, 211, 102, 0.3)',
                animation: 'pulse-glow 2s ease-in-out infinite',
              }}
            >
              <MessageCircle size={30} color="#fff" strokeWidth={2.2} />
            </div>

            {/* Heading */}
            <h2
              style={{
                textAlign: 'center',
                fontSize: '20px',
                fontWeight: 800,
                color: '#fff',
                margin: '0 0 6px',
                letterSpacing: '-0.02em',
              }}
            >
              Join Our WhatsApp Channel
            </h2>
            <p
              style={{
                textAlign: 'center',
                fontSize: '13.5px',
                color: 'rgba(255, 255, 255, 0.55)',
                margin: '0 0 20px',
                lineHeight: 1.5,
              }}
            >
              Stay updated with the latest services, promotions, and platform announcements!
            </p>

            {/* Benefits */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '22px',
              }}
            >
              {[
                { icon: Bell, text: 'Instant service updates & new features', color: '#25D366' },
                { icon: Zap, text: 'Exclusive deals & early access promos', color: '#FBBF24' },
                { icon: Users, text: 'Join 1,000+ active SocialPulse users', color: '#60A5FA' },
              ].map(({ icon: Icon, text, color }, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '9px',
                      background: `${color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={16} color={color} />
                  </div>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'rgba(255, 255, 255, 0.8)',
                      fontWeight: 500,
                    }}
                  >
                    {text}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <button
              onClick={handleJoin}
              style={{
                width: '100%',
                padding: '13px',
                background: 'linear-gradient(135deg, #25D366, #128C7E)',
                border: 'none',
                borderRadius: '13px',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 16px rgba(37, 211, 102, 0.3)',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 24px rgba(37, 211, 102, 0.45)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(37, 211, 102, 0.3)';
              }}
            >
              <MessageCircle size={18} />
              Join WhatsApp Channel
              <ExternalLink size={14} style={{ opacity: 0.7 }} />
            </button>

            <button
              onClick={handleDismiss}
              style={{
                width: '100%',
                padding: '10px',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.35)',
                fontSize: '12.5px',
                fontWeight: 500,
                cursor: 'pointer',
                marginTop: '8px',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.35)')}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 8px 24px rgba(37, 211, 102, 0.3); }
          50% { box-shadow: 0 8px 32px rgba(37, 211, 102, 0.5); }
        }
      `}</style>
    </>
  );
};
