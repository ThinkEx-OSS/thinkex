import React from 'react';
import './SpotlightModal.css';

interface SpotlightModalProps extends React.PropsWithChildren {
  className?: string;
  spotlightColor?: string;
  style?: React.CSSProperties;
}

const SpotlightModal: React.FC<SpotlightModalProps> = ({
  children,
  className = '',
  style,
}) => {
  return (
    <div className={`modal-spotlight ${className}`} style={style}>
      {children}
    </div>
  );
};

export default SpotlightModal;
