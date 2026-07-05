import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const NativeWebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

export default function App() {
  const webViewRef = useRef(null);

  // Use localhost for development, deployed URL for production
  const webUrl = __DEV__ 
    ? (Platform.OS === 'android' ? 'http://10.0.2.2:5173' : 'http://localhost:5173')
    : 'https://udicass.github.io/gesture-3d/';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {Platform.OS === 'web' ? (
        <iframe
          title="Gesture 3D"
          src={webUrl}
          style={styles.iframe}
          allow="camera; microphone; autoplay; fullscreen"
        />
      ) : (
        <NativeWebView
          ref={webViewRef}
          source={{ uri: webUrl }}
          style={styles.webview}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          allowsFullscreenVideo={true}
          mixedContentMode="always"
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView error: ', nativeEvent);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView HTTP error: ', nativeEvent);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05050a',
  },
  webview: {
    flex: 1,
  },
  iframe: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
    flex: 1,
  },
});
