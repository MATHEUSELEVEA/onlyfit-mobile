import { loadStripe } from '@stripe/stripe-js/pure';

loadStripe.setLoadParameters({ advancedFraudSignals: false });

export { loadStripe as loadOnlyFitStripe };
