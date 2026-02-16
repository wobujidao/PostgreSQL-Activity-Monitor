import React from 'react';
import './LoadingSpinner.css';

function LoadingSpinner({ text = "Загрузка...", subtext = "Пожалуйста, подождите" }) {
  return (
    <div className="loading-container">
      <div className="spinner-wrapper">
        <div className="modern-spinner"></div>
        <div className="spinner-inner">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
        </div>
        <div className="spinner-dots">
          <div className="spinner-dot"></div>
          <div className="spinner-dot"></div>
          <div className="spinner-dot"></div>
          <div className="spinner-dot"></div>
        </div>
      </div>
      <div>
        <div className="loading-text">{text}</div>
        <div className="loading-subtext">{subtext}</div>
      </div>
    </div>
  );
}

export default LoadingSpinner;
