# udeo (alpha)
Udeo is a [RxJS 5](http://github.com/ReactiveX/RxJS) based state stream container. It is comparable to Redux, where the store is instead modelled as a collection of state streams (one per module). Unidirectional data flow in Udeo is obtained with RxJS (instead of the event emitter approach of past and present Flux implementations), where each module composes its own data flow.

The reasoning behind using RxJS for unidirectional data flow is given here **(NB: yet to be published)**: https://medium.com/@markusctz/7921e3c376a4

A state stream is effectively the result of reducing a stream of actions. It boils down to the simple flow:

Action Stream -> Reduce -> State Stream

## Install

NOTE: This has a peer dependencies of `rxjs@5.0.*`

```sh
npm install --save udeo
```

## Usage
Please read about it on Medium **(NB: yet to be published)**: https://medium.com/@markusctz/7921e3c376a4

## React Bindings
https://github.com/mcoetzee/react-udeo
