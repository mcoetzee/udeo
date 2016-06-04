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

  it('caches state between subscriptions', () => {
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

    const store = createStore({ fooModule });

    let fooState;
    const sub1 = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });

    store.dispatch({ type: FOO });
    store.dispatch({ type: FOO });

    expect(fooState).to.deep.eq([FOO, FOO]);
    sub1.unsubscribe();

    const sub2 = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });
    expect(fooState).to.deep.eq([FOO, FOO]);
    store.dispatch({ type: FOO });
    expect(fooState).to.deep.eq([FOO, FOO, FOO]);

    sub2.unsubscribe();
  });

  it('manages to scale', () => {
    function generateModule(count) {
      const LOAD_FOO_X = `LOAD_FOO_${count}`;
      const LOAD_FOO_EFFECT_X = `LOAD_FOO_EFFECT_${count}`;
      const LOAD_BAR_X = `LOAD_BAR_${count}`;
      const LOAD_BAR_EFFECT_X = `LOAD_BAR_EFFECT_${count}`;
      const SHOOT_X = `SHOOT_${count}`;

      return {
        flow(dispatch$) {
          const loadFooX$ = dispatch$.filterAction(LOAD_FOO_X);
          const loadBarX$ = dispatch$.filterAction(LOAD_BAR_X);
          return [
            loadFooX$,
            loadFooX$.pluckPayload().filter(payload => payload > 42).mapAction(LOAD_FOO_EFFECT_X),
            loadBarX$,
            loadBarX$.pluckPayload().filter(payload => payload < 21).mapAction(LOAD_BAR_EFFECT_X),
            dispatch$.filterAction(SHOOT_X),
          ];
        },
        reducer(state = { foo: [], fooEffect: [], bar: [], barEffect: [], shoot: [] }, action) {
          switch (action.type) {
            case LOAD_FOO_X:
              return {
                ...state,
                foo: state.foo.concat(action.payload),
              };
            case LOAD_FOO_EFFECT_X:
              return {
                ...state,
                fooEffect: state.fooEffect.concat(action.payload * 10),
              };
            case LOAD_BAR_X:
              return {
                ...state,
                bar: state.bar.concat(action.payload),
              };
            case LOAD_BAR_EFFECT_X:
              return {
                ...state,
                barEffect: state.barEffect.concat(action.payload * 10),
              };
            case SHOOT_X:
              return {
                ...state,
                shoot: state.shoot.concat(action.payload),
              };
            default:
              return state;
          }
        }
      };
    }

    const modules = {};
    for (let i = 0; i < 300; i++) {
      const moduleName = `module${i}`;
      modules[moduleName] = generateModule(i);
    }

    console.time('creatStore');
    const store = createStore(modules);
    console.timeEnd('creatStore');

    let module50State;
    let sub1 = store.getState$('module50').subscribe(state => {
      module50State = state;
    });
    let module150State;
    let sub2 = store.getState$('module150').subscribe(state => {
      module150State = state;
    });
    let sub3 = store.getState$('module250').subscribe(state => {});

    console.time('dispatch-FOO');
    store.dispatch({ type: 'LOAD_FOO_50', payload: 40 });
    console.timeEnd('dispatch-FOO');
    expect(module50State.foo).to.deep.eq([40]);
    expect(module50State.fooEffect).to.deep.eq([]);
    expect(store.getState().module50 === module50State).to.eq(true);

    console.time('dispatch-BAR');
    store.dispatch({ type: 'LOAD_BAR_150', payload: 10 });
    console.timeEnd('dispatch-BAR');
    expect(module150State.bar).to.deep.eq([10]);
    expect(module150State.barEffect).to.deep.eq([100]);

    sub1.unsubscribe();
    sub2.unsubscribe();
    sub3.unsubscribe();
  });
});
