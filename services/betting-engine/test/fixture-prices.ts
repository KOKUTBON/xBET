import type { BetPlacementService } from '../src/betting/bet-placement.ts';
import type { PlaceBetRequest } from '../src/betting/bet-validator.ts';

/** Supplies fixed test fixture prices to the trusted internal pricing callback. */
export function placeFixtureBet(service: BetPlacementService, request: PlaceBetRequest) {
  return service.placeBet(request, (selectionId) => {
    const leg = request.legs.find((item) => item.selectionId === selectionId);
    if (!leg) throw new Error(`Missing test price for ${selectionId}`);
    return leg.submittedOdds;
  });
}
