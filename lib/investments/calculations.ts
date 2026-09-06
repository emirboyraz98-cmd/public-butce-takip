import Decimal from "decimal.js";

export type HoldingPL = {
  marketValue: Decimal;
  costBasis: Decimal;
  unrealizedPL: Decimal;
  unrealizedPLPercent: Decimal | null;
};

/**
 * marketValue = quantity × currentPrice
 * unrealizedPL = marketValue − (quantity × avgCostBasis)
 */
export function computeHoldingPL(
  quantity: Decimal | number | string,
  avgCostBasis: Decimal | number | string,
  currentPrice: Decimal | number | string
): HoldingPL {
  const qty = new Decimal(quantity);
  const marketValue = qty.mul(new Decimal(currentPrice));
  const costBasis = qty.mul(new Decimal(avgCostBasis));
  const unrealizedPL = marketValue.minus(costBasis);
  const unrealizedPLPercent = costBasis.isZero()
    ? null
    : unrealizedPL.div(costBasis).mul(100);

  return { marketValue, costBasis, unrealizedPL, unrealizedPLPercent };
}

export function sumMarketValue(values: (Decimal | number | string)[]): Decimal {
  return values.reduce(
    (acc: Decimal, v) => acc.plus(new Decimal(v)),
    new Decimal(0)
  );
}
