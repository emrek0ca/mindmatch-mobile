import { memo } from 'react';
import { Image, type ImageSourcePropType } from 'react-native';

export const moodOptions: ReadonlyArray<{ id: number; label: string; image: ImageSourcePropType; color: string }> = [
  { id: 1, label: 'Mutlu', image: require('../../assets/images/moods/happy.png'), color: '#FFE8D5' },
  { id: 2, label: 'Üzgün', image: require('../../assets/images/moods/sad.png'), color: '#E7EBF4' },
  { id: 3, label: 'Stresli', image: require('../../assets/images/moods/stressed.png'), color: '#F6E3DB' },
  { id: 4, label: 'Yalnız', image: require('../../assets/images/moods/lonely.png'), color: '#ECE6F0' },
  { id: 5, label: 'Sakin', image: require('../../assets/images/moods/calm.png'), color: '#E2EEDF' },
  { id: 6, label: 'Kaygılı', image: require('../../assets/images/moods/anxious.png'), color: '#E5EDF0' },
  { id: 7, label: 'Heyecanlı', image: require('../../assets/images/moods/excited.png'), color: '#FFF0D4' },
  { id: 8, label: 'Yorgun', image: require('../../assets/images/moods/tired.png'), color: '#EEE9E3' },
  { id: 9, label: 'Nötr', image: require('../../assets/images/moods/neutral.png'), color: '#EFEAE2' },
];

export function moodOption(mood: number) {
  return moodOptions.find(option => option.id === mood) ?? moodOptions[8];
}

export const MoodMascot = memo(function MoodMascot({ mood, size = 72 }: { mood: number; size?: number }) {
  return <Image source={moodOption(mood).image} resizeMode="contain" style={{ width: size, height: size }} />;
});
