import React, { useEffect, useState } from 'react';
import { Image, ImageProps, Platform } from 'react-native';
import { imageHeaders } from '../services/comics/opds';

/** Image qui envoie les identifiants d'un serveur OPDS protégé. Sur Windows (web), react-native-web n'envoie pas
 * d'en-têtes : l'image est téléchargée puis affichée depuis la mémoire. Les autres adresses passent telles quelles. */
export default function AuthImage({ uri, ...props }: Omit<ImageProps, 'source'> & { uri: string }) {
  const headers = imageHeaders(uri);
  const [blob, setBlob] = useState<string | null>(null);
  const needsFetch = Platform.OS === 'web' && !!headers;
  useEffect(() => {
    if (!needsFetch) return;
    let url = '';
    let active = true;
    setBlob(null);
    fetch(uri, { headers }).then(response => {
      if (!response.ok) throw new Error(String(response.status));
      return response.blob();
    }).then(data => {
      url = URL.createObjectURL(data);
      if (active) setBlob(url); else URL.revokeObjectURL(url);
    }).catch(() => { if (active) props.onError?.({ nativeEvent: { error: 'download failed' } } as any); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [uri, needsFetch]);
  if (needsFetch && !blob) return <Image {...props} source={{ uri: undefined }} onLoad={undefined} />;
  return <Image {...props} source={needsFetch ? { uri: blob! } : { uri, headers }} />;
}
