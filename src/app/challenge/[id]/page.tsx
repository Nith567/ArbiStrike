import { getChallengeById } from '~/lib/db';
import ChallengeAcceptPage from './ChallengeAcceptPage';

interface Props {
  params: { id: string };
}

export default async function ChallengePage({ params }: Props) {
  const challengeId = parseInt(params.id);
  
  if (isNaN(challengeId)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Invalid Challenge ID</h1>
          <p className="text-gray-600 mt-2">The challenge ID must be a number.</p>
        </div>
      </div>
    );
  }

  const challenge = await getChallengeById(challengeId);

  if (!challenge) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Challenge Not Found</h1>
          <p className="text-gray-600 mt-2">This challenge does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return <ChallengeAcceptPage challenge={challenge} />;
}
