import { Observable, Subject } from './rx-ext';

export function createStore(defs) {
  const dispatch$ = new Subject();
  const sideEffectStreams = {};
  const stateStreams = {};

  // Each module provides a definition which contains:
  // { flow, reducer }
  function addStreams(definitions) {
    Object.keys(definitions).forEach(moduleName => {
      const moduleResources = definitions[moduleName];
      const api = {
        getState$,
        getAction$: (actionType) => getSideEffect$(moduleName, actionType),
        dispatch,
      };

      const streams = moduleResources.flow(dispatch$, api);

      stateStreams[moduleName] = createState$(
        moduleName,
        streams,
        moduleResources.reducer
      );
    });
  }

  function dispatch(action) {
    dispatch$.next(action);
  }

  // Gets state stream or defer if stream has not yet been added
  function getState$(moduleName) {
    let state$ = stateStreams[moduleName];
    if (!state$) {
      stateStreams[moduleName] = state$ = Observable.defer(() => stateStreams[moduleName]);
    }
    return state$;
  }

  function getSideEffect$(requestingModule, type) {
    let register = sideEffectStreams[type];
    if (!register) {
      register = {
        sideEffect$: new Subject(),
        modules: { [requestingModule]: true }
      };
      sideEffectStreams[type] = register;
    } else {
      register.modules[requestingModule] = true;
    }

    return register.sideEffect$;
  }

  const metaDispatch$ = new Subject();
  const HYDRATE = '@app/HYDRATE';
  // Dispatch HYDRATE action which each state stream knows how to handle
  function hydrate(moduleName, h) {
    metaDispatch$.next({
      type: HYDRATE,
      payload: h,
      meta: moduleName,
    });
  }

  const CLEAR_STATE = '@app/CLEAR_STATE';
  // Dispatch CLEAR_STATE action which each state stream knows how to handle
  function clearState(moduleName) {
    metaDispatch$.next({
      type: CLEAR_STATE,
      meta: moduleName,
    });
  }

  let actionMiddleware;
  let newStateMiddleware;
  actionMiddleware = newStateMiddleware = () => {};
  // Set middleware to be invoked for each action and each state change
  function setMiddleware(...mw) {
    [actionMiddleware, newStateMiddleware] = mw;
  }

  function createState$(moduleName, streams, reducer) {
    // Combine module's action stream with common module actions streams
    const combinedAction$ = Observable.merge(
      ...streams,
      metaDispatch$.filter(action => action.meta === moduleName)
    );

    return combinedAction$
      // Side effects
      .do(action => {
        const register = sideEffectStreams[action.type];
        if (register && !register.modules[moduleName]) {
          register.sideEffect$.next(action);
        }
        actionMiddleware(moduleName, action);
      })
      // Use dummy action to get initial state from reducer
      .startWith(reducer(undefined, { type: '@app/INIT' }))
      // Reduce state
      .scan((state, action) => {
        switch (action.type) {
          case HYDRATE:
            return {
              ...state,
              ...action.payload,
              hydrated: true,
            };

          case CLEAR_STATE:
            return reducer(undefined, action);

          default:
            return reducer(state, action);
        }
      })
      // Side effects
      .do(state => newStateMiddleware(moduleName, state))
      .publishReplay(1)
      .refCount();
  }

  // Init
  addStreams(defs);

  // Store API
  return {
    addStreams,
    dispatch,
    getState$,
    hydrate,
    clearState,
    setMiddleware,
  };
}
