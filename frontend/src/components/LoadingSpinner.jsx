import { Loader2 } from 'lucide-react';

function LoadingSpinner({ text = "Загрузка...", subtext = "Пожалуйста, подождите" }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="relative">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">{text}</p>
        <p className="text-sm text-muted-foreground">{subtext}</p>
      </div>
    </div>
  );
}

export default LoadingSpinner;
