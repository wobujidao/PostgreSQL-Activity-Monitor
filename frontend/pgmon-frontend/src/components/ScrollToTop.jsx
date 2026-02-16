import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggle = () => setIsVisible(window.pageYOffset > 300);
    window.addEventListener('scroll', toggle);
    return () => window.removeEventListener('scroll', toggle);
  }, []);

  if (!isVisible) return null;

  return (
    <Button
      size="icon"
      className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg h-12 w-12"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Наверх"
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  );
}

export default ScrollToTop;
