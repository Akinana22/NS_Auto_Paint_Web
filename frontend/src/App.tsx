import { useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage';
import TomodachiPage from './pages/TomodachiPage';
import SplatoonPage from './pages/SplatoonPage';

function setLayoutVars() {
  const sw = window.screen.width;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const r = document.documentElement.style;
  if (isMobile) {
    r.setProperty('--sw20', '100%');
    r.setProperty('--sw50', '100%');
    r.setProperty('--sw60', '100%');
  } else {
    r.setProperty('--sw20', `${Math.round(sw * 0.2)}px`);
    r.setProperty('--sw50', `${Math.round(sw * 0.5)}px`);
    r.setProperty('--sw60', `${Math.round(sw * 0.6)}px`);
  }
}

export default function App() {
  useEffect(() => {
    setLayoutVars();
    window.addEventListener('resize', setLayoutVars);
    return () => window.removeEventListener('resize', setLayoutVars);
  }, []);

  return (
    <div className="app">
      <nav className="top-nav">
        <NavLink to="/" end>首页</NavLink>
        <NavLink to="/tomodachi">朋友收集</NavLink>
        <NavLink to="/splatoon">斯普拉顿</NavLink>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tomodachi" element={<TomodachiPage />} />
          <Route path="/splatoon" element={<SplatoonPage />} />
        </Routes>
      </main>
    </div>
  );
}
