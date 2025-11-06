import { AnimatePresence } from 'framer-motion';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Loading from './pages/Loading';
import NameInput from './pages/NameInput';
import Detection from './pages/Detection';
import Result from './pages/Result';

function App() {
  return (
    <Router>
      <AnimatePresence mode='wait'>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/loading" element={<Loading />} />
          <Route path="/name-input" element={<NameInput />} />
          <Route path="/detection" element={<Detection />} />
          <Route path="/result" element={<Result />} />
        </Routes>
      </AnimatePresence>
    </Router>
  );
}

export default App;