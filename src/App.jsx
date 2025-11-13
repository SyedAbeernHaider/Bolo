import { AnimatePresence } from 'framer-motion';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Loading from './pages/Loading';
import NameInput from './pages/NameInput';
import Detection from './pages/Detection';
import Result from './pages/Result';
import Dataset from './pages/Dataset';

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
          <Route path="/dataset" element={<Dataset />} />
        </Routes>
      </AnimatePresence>
    </Router>
  );
}

export default App;