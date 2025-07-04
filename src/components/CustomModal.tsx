import React from 'react';
import { Modal, View, StyleSheet, TouchableWithoutFeedback } from 'react-native';

interface CustomModalProps {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  transparent?: boolean;
  alignment?: 'center' | 'bottom';
}

const CustomModal: React.FC<CustomModalProps> = ({
  visible,
  onRequestClose,
  children,
  transparent = true,
  alignment = 'center',
}) => {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={transparent}
      onRequestClose={onRequestClose}
    >
      <TouchableWithoutFeedback onPress={onRequestClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View
        style={[
          styles.container,
          alignment === 'bottom' && styles.bottomSheet,
        ]}
      >
        {children}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -150 }, { translateY: -200 }],
    width: 300,
    maxHeight: '80%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
  },
  bottomSheet: {
    top: undefined,
    left: 0,
    right: 0,
    bottom: 0,
    transform: undefined,
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
});

export default CustomModal; 