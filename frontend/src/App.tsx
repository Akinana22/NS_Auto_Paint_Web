import { useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage';
import TomodachiPage from './pages/TomodachiPage';
import SplatoonPage from './pages/SplatoonPage';

function setLayoutVars() {
  const sw = window.screen.width;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const min20 = isMobile ? 320 : 400;
  const r = document.documentElement.style;
  r.setProperty('--sw20', `${Math.max(Math.round(sw * 0.2), min20)}px`);
  r.setProperty('--sw60', `${Math.max(Math.round(sw * 0.6), 720)}px`);
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
