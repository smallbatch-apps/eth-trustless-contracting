## Contractor Payments Smart Contract

The intent behind these contracts is to allow for freelance development work where trust is lacking between the partipants. In particular it's aimed at a case where the contractor lacks trust that they will be paid for their work.

To enforce this this principle, there is **no mechanism** within the contract for the initiating address, the `owner`, to retrieve the funds put into the smart contract. Only the `contractor` address can be sent funds. It is therefore impossible for the owner to keep the funds once they are locked up, so little incentive to delay payment.

In essence this smart contract is escrow, in installments.

## Typical Usage

The usage pattern is relatively simple.

1. The contract is deployed with two arguments, and an attached value. The arguments are the contractor's address, and an identifier. This could be an invoice ID, or any string, really. Making it unique is helpful, but not enforced, it's mostly just an ancillary detail in case you are running multiple contracts.

2. Add a `payment`. A payment is a single installment, which takes only a single argument - `percentage`. This percentage could range from 1 - 99%.

```
await instance.addPayment(20);
// one payment at 20%
```

3. Continue adding payments, but the final payment simply omit entirely. Closing out the contract will send all remaining funds to the `contractor` address.

```
await instance.addPayment(20);
await instance.addPayment(20);
await instance.addPayment(20);
// now totals 80%
```

4. As work is done and the payments are due they can be approved sequentially by just saying `approveCurrentPayment()`. This sets the payment as ready to be paid on request. It also increments the internal `approvalIndex` to the next payment.

```
await instance.approveCurrentPayment();
```

5. The contractor now can request the payment. This also increments the `claimIndex` so that the next payment is the "current" one. Not that only approved payments can be requested successfully.

```
await instance.requestPayment();
// this function transfers an amount of
// eth x% of the initial deployed value
```

6. Once all of the work is done, the `owner` can run the `setComplete()` function. This sets a flag to allow the `contractor` to do the same, closing out the work.

```
await instance.setCompleted();
```

Once this function has been executed by the `contractor` after having been previously executed by the `owner`, all funds remaining in the contract will be sent to the contractor, via the Solidity `selfdestruct()` method.

## Example

Company rep Susan wants to hire David for some development work. The terms arranged are a total of 15 eth. 40% to be paid upfront as a deposit, followed by four payments of 15% each in two week sprints.

Susan deploys the smart contract with a value of 15 eth.

Susan adds **four (4)** payments. The first is for 40%, the next three are for 15%. Note that this adds up to 85%.

Susan then immediately runs the `approveCurrentPayment()` method - this is the first deposit payment.

David runs the `requestPayment()` method and is immediately sent 6 eth.

David begins work, and after two weeks, when the first block of work is done and approved, Susan runs the `approveCurrentPayment()` method again.

David runs the `requestPayment()` method and is immediately sent another 2.25 eth.

This process is repeated two more times.

On completion of the final block of work, Susan runs the `setCompleted()` method to confirm that she's happy with the completion of the work. David also runs that method, and the smart contract executes its `selfdestruct(contractor)` method, sending all remaining funds to David.

## Caveats and additional details

As it stands, you cannot extend contracts. This is because the payments are percentage based, rather than a fixed amount.

Additional funds can be sent to the contract, as it does implement a payable fallback function. However, these additional funds would throw off any percentage calculations, and thus cannot be retrieved until work completion.

No guarantees or warranties are made with actual usage of this smart contract, and it was built entirely as a proof-of-concept, nothing more.

The contract has been explicitly designed to handle only amounts of funds up to 99 eth per payment. Though it has been tested to upwards of 9900 this is not at all recommended. There **is** a maximum amount at which payment calculations can no longer be made because the percentage calculation goes outside of integer bounds. This contract has not found that limit, and we do not recommend you do so.