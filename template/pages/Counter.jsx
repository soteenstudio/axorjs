// @import Title from "../components/Title.jsx"
// @import Link from "../components/Link.jsx"
// @import Navigation from "../components/Navigation.jsx"
// @import Button from "../components/Button.jsx"
// @import CountTitle from "../components/CountTitle.jsx"
// @import RowContainer from "../components/RowContainer.jsx"
// @import Container from "../components/Container.jsx"

// @persist
let count = 0;
const incrementCount = () => {
  if (count >= 20) return;
  count++;
};
const decrementCount = () => {
  if (count <= 0) return;
  count--;
};

<Container>
  <CountTitle>Count: {count >= 20 ? 'Max' : count}</CountTitle>
  <RowContainer>
    <Button handle={incrementCount} text="Increment"></Button>
    <Button handle={decrementCount} text="Decrement"></Button>
  </RowContainer>
  <Navigation></Navigation>
</Container>;
