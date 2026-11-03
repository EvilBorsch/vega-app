import React, {useEffect, useState} from 'react';
import {Text, type TextProps} from 'react-native';

/** Seconds since this appeared, so a long wait is visibly alive. */
export default function ElapsedSeconds(props: TextProps) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Text {...props}>{Math.floor((now - startedAt) / 1000)} s</Text>;
}
