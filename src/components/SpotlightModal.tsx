import React from 'react';
import './SpotlightModal.css';

interface SpotlightModalProps extends React.PropsWithChildren {
  className?: string;
  spotlightColor?: string;
}

const SpotlightModal: React.FC<SpotlightModalProps> = ({
  children,
  className = ''
}) => {
  return (
    <div className={`modal-spotlight ${className}`}>
      {children}
    </div>
  );
};

export default SpotlightModal;
