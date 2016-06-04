/* globals describe it */
import { expect } from 'chai';
import { createStore } from '../';

const FOO = '@test/FOO';
const BAR = '@test/BAR';

const noopModule = {
  flow: dispatch$ => [dispatch$],
  reducer: (state, action) => state,
};

function fooFlow(dispatch$) {
  return [
    dispatch$.filterAction(FOO)
  ];
}

function barFlow(dispatch$) {
  return [
    dispatch$.filterAction(BAR)
  ];
}

describe('createStore', () => {
  it('exposes the public API', () => {
    const store = createStore({ noopModule });

    expect(Object.keys(store)).to.have.length(6);
    expect(store.getState$).to.be.a('function');
    expect(store.getState).to.be.a('function');
    expect(store.dispatch).to.be.a('function');
    expect(store.setMiddleware).to.be.a('function');
    expect(store.hydrate).to.be.a('function');
    expect(store.clearState).to.be.a('function');
  });

  it('gets initial state from reducer', () => {
    const initialState = { valueA: 10 };
    const fooModule = {
      flow: dispatch$ => [dispatch$],
      reducer: (state = initialState, action) => state
    };

    const store = createStore({ fooModule });

    let fooState;
    const sub = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });

    expect(fooState).to.deep.eq({ valueA: 10 });
    sub.unsubscribe();
  });

  describe('dispatch', () => {
    it('reaches all active streams', () => {
      const fooModule = {
        flow: fooFlow,
        reducer(state = [], { type }) {
          switch (type) {
            case FOO:
              return state.concat(type);
            default:
              return state;
          }
        },
      };
      const barModule = {
        flow: barFlow,
        reducer(state = [], { type }) {
          switch (type) {
            case BAR:
              return state.concat(type);
            default:
              return state;
          }
        },
      };

      const store = createStore({
        fooModule,
        barModule,
      });

      let fooState;
      const subOne = store.getState$('fooModule').subscribe(state => {
        fooState = state;
      });

      let barState;
      const subTwo = store.getState$('barModule').subscribe(state => {
        barState = state;
      });

      expect(fooState).to.deep.equal([]);
      expect(barState).to.deep.equal([]);

      store.dispatch({ type: FOO });

      expect(fooState).to.deep.equal([FOO]);
      expect(barState).to.deep.equal([]);

      store.dispatch({ type: BAR });

      expect(fooState).to.deep.equal([FOO]);
      expect(barState).to.deep.equal([BAR]);

      subOne.unsubscribe();
      subTwo.unsubscribe();
    });
  });

  it('allows state access when composing action streams', () => {
    const fooModule = {
      flow(dispatch$, { getState }) {
        const foo$ = dispatch$.filterAction(FOO)
          .pluckPayload()
          .map(payload => getState().barModule.bar * payload)
          .mapAction(FOO);

        return [foo$];
      },
      reducer(state = [], { type, payload }) {
        switch (type) {
          case FOO:
            return state.concat(payload);
          default:
            return state;
        }
      }
    };

    const barModule = {
      flow: barFlow,
      reducer(state = { bar: 2 }, action) {
        return state;
      }
    };

    const store = createStore({
      fooModule,
      barModule,
    });

    let fooState;
    const subOne = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });

    store.dispatch({ type: FOO, payload: 10 });
    expect(fooState).to.deep.eq([20]);

    store.dispatch({ type: FOO, payload: 21 });
    expect(fooState).to.deep.eq([20, 42]);

    subOne.unsubscribe();
  });

  it('preloads state', () => {
    const fooModule = {
      flow: fooFlow,
      reducer(state = { valueA: 11, valueB: 12 }, { type }) {
        switch (type) {
          case FOO:
            return {
              ...state,
              valueA: state.valueA * 2,
            };
          default:
            return state;
        }
      },
    };

    const preloadedState = {
      fooModule: { valueA: 13, valueB: 14 }
    };
    const store = createStore({ fooModule }, preloadedState);

    let fooState;
    const sub1 = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });

    expect(fooState).to.deep.eq({ valueA: 13, valueB: 14 });

    store.dispatch({ type: FOO });
    expect(fooState).to.deep.eq({ valueA: 26, valueB: 14 });
    sub1.unsubscribe();
  });
});
