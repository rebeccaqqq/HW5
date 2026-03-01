import { useState } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import YouTubeChannelDownload from './components/YouTubeChannelDownload';
import './App.css';

function App() {
  const [user, setUser] = useState(() => {
    const storedProfile = localStorage.getItem('chatapp_user_profile');
    if (storedProfile) {
      try {
        return JSON.parse(storedProfile);
      } catch {
        // fall through to legacy key
      }
    }
    const legacyUsername = localStorage.getItem('chatapp_user');
    return legacyUsername ? { username: legacyUsername, firstName: '', lastName: '' } : null;
  });
  const [activeTab, setActiveTab] = useState('chat');

  const handleLogin = (profile) => {
    const safeProfile = {
      username: profile.username,
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
    };
    localStorage.setItem('chatapp_user_profile', JSON.stringify(safeProfile));
    localStorage.setItem('chatapp_user', safeProfile.username);
    setUser(safeProfile);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    localStorage.removeItem('chatapp_user_profile');
    setUser(null);
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  const displayName =
    (user.firstName || user.lastName
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
      : user.username) || '';

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Chat</h1>
        <nav className="app-tabs">
          <button
            type="button"
            className={activeTab === 'chat' ? 'app-tab active' : 'app-tab'}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={activeTab === 'youtube' ? 'app-tab active' : 'app-tab'}
            onClick={() => setActiveTab('youtube')}
          >
            YouTube Channel Download
          </button>
        </nav>
      </header>
      <main className="app-main">
        {activeTab === 'chat' ? (
          <Chat username={user.username} displayName={displayName} onLogout={handleLogout} />
        ) : (
          <YouTubeChannelDownload username={user.username} displayName={displayName} />
        )}
      </main>
    </div>
  );
}

export default App;
