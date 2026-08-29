declare module 'twitter-text' {
  export type ParsedTweet = {
    weightedLength: number;
    valid: boolean;
    permillage: number;
    validRangeStart: number;
    validRangeEnd: number;
    displayRangeStart: number;
    displayRangeEnd: number;
  };

  const twitterText: {
    parseTweet(value: string): ParsedTweet;
  };

  export default twitterText;
}
