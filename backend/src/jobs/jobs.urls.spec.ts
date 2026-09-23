import { acceptedUrl } from './jobs.urls';

describe('acceptedUrl', () => {
  const watch = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

  it('canonicalises every single-video YouTube shape', () => {
    for (const input of [
      watch,
      'https://youtube.com/watch?v=aqz-KE-bpKQ&list=PL1&t=42',
      'https://m.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://music.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtu.be/aqz-KE-bpKQ?si=x',
      'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      'https://www.youtube.com/live/aqz-KE-bpKQ',
    ]) {
      expect(acceptedUrl(input)).toBe(watch);
    }
  });

  it('accepts one SoundCloud track and strips its tracking', () => {
    expect(
      acceptedUrl('https://soundcloud.com/couvbat/abysses?utm_source=x#t=1'),
    ).toBe('https://soundcloud.com/couvbat/abysses');
    expect(acceptedUrl('http://m.soundcloud.com/couvbat/abysses/')).toBe(
      'https://soundcloud.com/couvbat/abysses',
    );
  });

  it('refuses profiles, sets, playlists, other hosts and junk', () => {
    for (const bad of [
      'https://soundcloud.com/couvbat',
      'https://soundcloud.com/couvbat/sets/mon-bruit',
      'https://soundcloud.com/discover/x',
      'https://www.youtube.com/playlist?list=PL1',
      'https://www.youtube.com/watch?v=short',
      'https://vimeo.com/1',
      'file:///etc/passwd',
      '--version',
      '',
    ]) {
      expect(acceptedUrl(bad)).toBeNull();
    }
  });
});
