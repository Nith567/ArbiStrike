import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export interface Challenge {
  id: number;
  creator: string;
  creatorFid: number;
  creatorName?: string;
  creatorPfp?: string;
  opponent?: string;
  opponentFid?: number;
  opponentName?: string;
  opponentPfp?: string;
  betAmount: string;
  status: 'created' | 'waiting_opponent' | 'accepted' | 'completed';
  winner?: string;
  transactionHash?: string;
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
}

// Redis key helpers
function getChallengeKey(id: number): string {
  return `typing-game:challenge:${id}`;
}

function getChallengeCounterKey(): string {
  return `typing-game:challenge-counter`;
}

function getPendingChallengesKey(): string {
  return `typing-game:pending-challenges`;
}

export async function getNextChallengeId(): Promise<number> {
  const counter = await redis.get<number>(getChallengeCounterKey());
  const nextId = (counter || 12) + 1; // Start from 13 as requested
  await redis.set(getChallengeCounterKey(), nextId);
  return nextId;
}

export async function createChallenge(challenge: Omit<Challenge, 'id' | 'createdAt'>): Promise<Challenge> {
  const id = await getNextChallengeId();
  const newChallenge: Challenge = {
    ...challenge,
    id,
    createdAt: new Date(),
  };
  
  // Store the challenge
  await redis.set(getChallengeKey(id), newChallenge);
  
  // Add to pending challenges list
  await redis.sadd(getPendingChallengesKey(), id);
  
  return newChallenge;
}

export async function getChallengeById(id: number): Promise<Challenge | null> {
  return await redis.get<Challenge>(getChallengeKey(id));
}

export async function acceptChallenge(id: number, opponent: string, opponentFid: number): Promise<Challenge | null> {
  const challenge = await getChallengeById(id);
  if (!challenge || challenge.status !== 'waiting_opponent') {
    return null;
  }
  
  // If opponent data already exists, validate that the accepter matches
  // Otherwise, set the opponent data (for backwards compatibility)
  if (challenge.opponent && challenge.opponentFid) {
    // Validate that the person accepting matches the intended opponent
    if (challenge.opponentFid !== opponentFid) {
      console.log('Challenge accept validation failed: FID mismatch');
      console.log('Expected:', challenge.opponentFid, 'Got:', opponentFid);
      return null;
    }
    // Don't overwrite opponent address - keep the original one from challenge creation
  } else {
    // For backwards compatibility with challenges that don't have opponent data yet
    challenge.opponent = opponent;
    challenge.opponentFid = opponentFid;
  }
  
  challenge.status = 'accepted';
  challenge.acceptedAt = new Date();
  
  // Update the challenge in Redis
  await redis.set(getChallengeKey(id), challenge);
  
  // Remove from pending challenges list
  await redis.srem(getPendingChallengesKey(), id);
  
  return challenge;
}

export async function completeChallenge(id: number, winner: string, transactionHash?: string): Promise<Challenge | null> {
  const challenge = await getChallengeById(id);
  if (!challenge) {
    return null;
  }
  
  // Allow completion if status is 'accepted' or 'waiting_opponent' (in case both players played)
  if (challenge.status !== 'accepted' && challenge.status !== 'waiting_opponent') {
    console.log(`Cannot complete challenge ${id}: status is ${challenge.status}, expected 'accepted' or 'waiting_opponent'`);
    return null;
  }
  
  challenge.winner = winner;
  challenge.status = 'completed';
  challenge.completedAt = new Date();
  if (transactionHash) {
    challenge.transactionHash = transactionHash;
  }
  
  // Update the challenge in Redis
  await redis.set(getChallengeKey(id), challenge);
  
  return challenge;
}

export async function updateChallengeAfterCreatorPlays(id: number): Promise<Challenge | null> {
  const challenge = await getChallengeById(id);
  if (!challenge || challenge.status !== 'created') {
    return null;
  }
  
  challenge.status = 'waiting_opponent';
  
  // Update the challenge in Redis
  await redis.set(getChallengeKey(id), challenge);
  
  return challenge;
}

export async function getPendingChallenges(): Promise<Challenge[]> {
  const pendingIds = await redis.smembers(getPendingChallengesKey());
  const challenges: Challenge[] = [];
  
  for (const id of pendingIds) {
    const challenge = await getChallengeById(Number(id));
    if (challenge && (challenge.status === 'created' || challenge.status === 'waiting_opponent')) {
      challenges.push(challenge);
    }
  }
  
  return challenges;
}
