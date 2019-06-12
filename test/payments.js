const Payments = artifacts.require("Payments");
const ethers = require('ethers');
const assertRevert = require('./utils/assertRevert');

const provider = new ethers.providers.JsonRpcProvider("http://localhost:7545");

contract('Payments', accounts => {
  const [OWNER, CONTRACTOR] = accounts;
  let ethOwnerInstance = false;
  let ethContractorInstance = false;
  let truffleInstance = false;

  const etherValue = 1000;
  const ownerSigner = provider.getSigner(0);
  const contractorSigner = provider.getSigner(1);
  const expectedPaymentAmount = 400;
  const projectId = "GA-1276";

  describe("Contract setup", () => {

    beforeEach(async () => {
      truffleInstance = await Payments.new(CONTRACTOR, projectId);
      ethOwnerInstance = await createEthersContractAs(truffleInstance.address, ownerSigner);
    });

    it("has a contractor address", async () => {
      const savedContractor = await ethOwnerInstance.contractor();
      assert.equal(savedContractor, CONTRACTOR, "Contractor is not properly set");
    });

    it("has a project id", async () => {
      const contractProjectId = await ethOwnerInstance.projectId();
      assert.equal(contractProjectId, projectId, "Project ID is not properly set");
    });

    it("has an array of payments", async () => {
      const paymentsArrayLength = await ethOwnerInstance.payments.length;
      assert.equal(paymentsArrayLength, 0, "Payments array is not a zero length array")
    });

    it("has indices for current payment", async () => {
      const claimIndex = await ethOwnerInstance.claimIndex();
      const approvalIndex = await ethOwnerInstance.approvalIndex();

      assert.equal(claimIndex, 0, "Claim Index should be zero");
      assert.equal(approvalIndex, 0, "Approval Index should be zero");
    });

    it("can be deployed with an ether balance", async () => {
      truffleInstance = await Payments.new(CONTRACTOR, projectId, {value: etherValue});
      const etherBalance = await provider.getBalance(truffleInstance.address);
      assert.equal(etherBalance.toNumber(), etherValue);
    });

  })

  describe("Payment setup", () => {

    beforeEach(async () => {
      truffleInstance = await Payments.new(CONTRACTOR, projectId);
      ethOwnerInstance = await createEthersContractAs(truffleInstance.address, ownerSigner);
      ethContractorInstance = await createEthersContractAs(truffleInstance.address, contractorSigner);
    });

    it("Can have a payment added", async () => {
      await ethOwnerInstance.addPayment(40);
      const payment = await ethOwnerInstance.payments(0);
      assert.equal(payment.percentage, 40);
      assert.equal(payment.isApproved, false);
      assert.equal(payment.isPaid, false);
    });

    it("Must not allow non-owners to add payments", async () => {
      await assertRevert(ethContractorInstance.addPayment(40), "Only the owner may do that");
    });

    it("Must not allow a invalid percentage in payment", async () => {
      await assertRevert(ethOwnerInstance.addPayment("Steve"), "invalid input argument");
      await assertRevert(ethOwnerInstance.addPayment(112), "Invalid percentage provided");
      await assertRevert(ethOwnerInstance.addPayment(0), "Invalid percentage provided");
    });

    it("Can have multiple payments added", async () => {
      await ethOwnerInstance.addPayment(40);
      await ethOwnerInstance.addPayment(40);
      await ethOwnerInstance.addPayment(5);

      const payment = await ethOwnerInstance.payments(2);
      assert.equal(payment.percentage, 5);
      assert.equal(payment.isApproved, false);
      assert.equal(payment.isPaid, false);
      const paymentsLength = await ethOwnerInstance.getPaymentsLength();

      assert.equal(paymentsLength.toNumber(), 3, "Payment length is not incremented");
    });

    it("Must reject payments greater than 100%", async () => {
      await ethOwnerInstance.addPayment(40);
      await ethOwnerInstance.addPayment(40);

      await assertRevert(ethOwnerInstance.addPayment(30), "Payments must total less than 100 percent");
      let paymentPercentage = await ethOwnerInstance.paymentPercentage();
      assert.equal(paymentPercentage, 80);

      await assertRevert(ethOwnerInstance.addPayment(20), "Payments must total less than 100 percent");
      paymentPercentage = await ethOwnerInstance.paymentPercentage();
    });
  });

  describe("Ether payments", () => {

    beforeEach(async () => {
      truffleInstance = await Payments.new(CONTRACTOR, projectId, {value: etherValue});
      ethOwnerInstance = await createEthersContractAs(truffleInstance.address, ownerSigner);
      ethContractorInstance = await createEthersContractAs(truffleInstance.address, contractorSigner);
      await ethOwnerInstance.addPayment(40);
      await ethOwnerInstance.addPayment(15);
      await ethOwnerInstance.addPayment(15);
      await ethOwnerInstance.addPayment(15);
    });

    it("allows owner to approve payment completion", async () => {
      await ethOwnerInstance.approveCurrentPayment();
      const approvalIndex = await ethOwnerInstance.approvalIndex();
      assert.equal(approvalIndex, 1, "Approval index is not being modified");
    });

    it("triggers an event to show that the payment was approved", async () => {
      const approvalEvent = new Promise((resolve, reject) => {
        ethContractorInstance.on('PaymentApproved', (projectId, contractor, amount, event) => {
          event.removeListener();
          resolve({ projectId, contractor, amount: amount.toNumber() });
        });

        setTimeout(() => reject(new Error('timeout')), 10000)
      });

      await ethOwnerInstance.approveCurrentPayment();

      const event = await approvalEvent;

      assert.equal(event.contractor, CONTRACTOR);
      assert.equal(event.amount, expectedPaymentAmount);
    });

    it("does not allow a non-owner to approve payment completion", async () => {
      await assertRevert(ethContractorInstance.approveCurrentPayment(), "Only the owner may do that");
    });

    it("does not allow a contractor to request payment before owner approval", async () => {
      await assertRevert(ethContractorInstance.requestPayment(), "The contract owner has not approved this payment");
    });

    it("allows contractor to request funds for payment", async () => {
      await ethOwnerInstance.approveCurrentPayment();
      await ethContractorInstance.requestPayment();
      const claimIndex = await ethContractorInstance.claimIndex();
      assert.equal(claimIndex, 1, "Claim index is not being modified");
    });

    it("sends funds to the contractor on request", async () => {
      const initialBalance = await provider.getBalance(CONTRACTOR);

      await ethOwnerInstance.approveCurrentPayment();

      const {gasPrice, hash} = await ethContractorInstance.requestPayment();
      const {gasUsed} = await provider.getTransactionReceipt(hash);

      const newBalance = await provider.getBalance(CONTRACTOR);

      const expectedBalance = initialBalance.sub(gasUsed.mul(gasPrice)).add(expectedPaymentAmount);

      assert.equal(expectedBalance.toString(), newBalance.toString(), "Sending balance is not correct");
    });

    it("triggers an event to show that the payment was claimed", async () => {
      const paymentEvent = new Promise((resolve, reject) => {
        ethContractorInstance.on('PaymentClaimed', (projectId, owner, contractor, amount, event) => {
          event.removeListener();
          resolve({ projectId, owner, contractor, amount: amount.toNumber() });
        });

        setTimeout(() => reject(new Error('timeout')), 10000)
      });
      await ethOwnerInstance.approveCurrentPayment();
      await ethContractorInstance.requestPayment();

      const event = await paymentEvent;

      assert.equal(event.owner, OWNER);
      assert.equal(event.contractor, CONTRACTOR);
      assert.equal(event.amount, expectedPaymentAmount);
    });

    it("Can retrieve current payment's details for contractor", async () => {
      await ethOwnerInstance.approveCurrentPayment();
      await ethContractorInstance.requestPayment();

      const currentPayment = await ethContractorInstance.getNextContractorPayment();
      assert.equal(currentPayment.percentage, 15);
    });

    it("Can retrieve current payment's details for owner", async () => {
      await ethOwnerInstance.approveCurrentPayment();
      await ethOwnerInstance.approveCurrentPayment();
      await ethOwnerInstance.approveCurrentPayment();

      const currentPayment = await ethOwnerInstance.getNextOwnerPayment();
      assert.equal(currentPayment.percentage, 15);
    });

    it("Does not return payment if there are none", async () => {
      await ethOwnerInstance.approveCurrentPayment();
      await ethOwnerInstance.approveCurrentPayment();
      await ethOwnerInstance.approveCurrentPayment();
      await ethOwnerInstance.approveCurrentPayment();

      await assertRevert(ethOwnerInstance.getNextOwnerPayment(), "There are no matching payments");
    });

    it("Can retrieve an arbitrary payment's details", async () => {
      await ethOwnerInstance.addPayment(5);
      const length = await ethOwnerInstance.getPaymentsLength();
      const currentPayment = await ethOwnerInstance.getPayment(length.sub(1));
      assert.equal(currentPayment.percentage, 5);
    });

    it("allows the owner to complete the project", async () => {
      await ethOwnerInstance.setCompleted();
      const isCompleted = await ethOwnerInstance.ownerCompleted();
      assert.isOk(isCompleted);
    });

    it("allows the contractor to complete the project", async () => {
      await ethOwnerInstance.setCompleted();
      await ethContractorInstance.setCompleted();
    });

    it("does not allow the contractor to complete the project before the owner", async () => {
      await assertRevert(ethContractorInstance.setCompleted(), "The contract owner has not approved completion");
    });

    it("fires an event to tell the contractor the project is complete", async () => {
      const completedEvent = new Promise((resolve, reject) => {
        ethContractorInstance.on('ProjectComplete', (projectId, contractor, amount, event) => {
          event.removeListener();
          resolve({ projectId, contractor, amount: amount.toNumber() });
        });

        setTimeout(() => reject(new Error('timeout')), 10000)
      });

      await ethOwnerInstance.setCompleted();

      const event = await completedEvent;

      assert.equal(event.contractor, CONTRACTOR);
      assert.equal(event.amount, etherValue);
    });

    it("fires an event to tell the owner the project has been closed", async () => {
      const completedEvent = new Promise((resolve, reject) => {
        ethOwnerInstance.on('ProjectClosed', (projectId, owner, event) => {
          event.removeListener();
          resolve({ owner });
        });

        setTimeout(() => reject(new Error('timeout')), 10000)
      });

      await ethOwnerInstance.setCompleted();
      await ethContractorInstance.setCompleted();

      const event = await completedEvent;

      assert.equal(event.owner, OWNER);
    });

    it("sends the contractor all remaining funds on completion of the project", async () => {
      const initialBalance = await provider.getBalance(CONTRACTOR);
      const contractBalance = await ethContractorInstance.getCurrentBalance();

      await ethOwnerInstance.setCompleted();

      const {gasPrice, hash} = await ethContractorInstance.setCompleted();
      const {gasUsed} = await provider.getTransactionReceipt(hash);

      const newBalance = await provider.getBalance(CONTRACTOR);

      const expectedBalance = initialBalance.sub(gasUsed.mul(gasPrice)).add(contractBalance);

      assert.equal(expectedBalance.toString(), newBalance.toString(), "Sending balance is not correct");
    });

    it("kills the smart contract when the project is closed", async () => {
      await ethOwnerInstance.setCompleted();
      await ethContractorInstance.setCompleted();
      try {
        await ethContractorInstance.getCurrentBalance();
        assert.fail("Expected error not found - Selfdestruct error");
      }
      catch(error) {
        assert.equal(error.reason, 'call exception', "Contract selfdestruct may have failed");
      }
    });

  });

  xdescribe("Real World number handling", () => {
    /*
    This block should not be executed by default. It is a test of extreme values to ensure
    that real-world figures do not overrun limits - the test amount used is typically 1000,
    but as this is in wei it would be fractions of a cent in real world currency.

    As an example, a $3000USD contract would be 12.26eth, meaning a wei amount of
    12,260,000,000,000,000,000. Numbers at this scale can easily overrun both JS and Solidity units
    especially during math. In the case of a percentage (for example) you have to multiply by the
    integer percentage, then divide the result. This can be a large multiplier, hence 99% is used in the test.

    This test has been passed using as much as a 9900 eth contract with custom Ganache setup, but has been
    returned to a 99 eth contract to execute with a default ganache setup.

    This test cannot be run multiple times as it WILL wipe out the balance of a standard test account and
    require a reset.
    */
    beforeEach(async () => {
      truffleInstance = await Payments.new(accounts[6], projectId, {value: ethers.utils.bigNumberify('99000000000000000000'), from: accounts[5]});
      ethOwnerInstance = await createEthersContractAs(truffleInstance.address, provider.getSigner(5));
      ethContractorInstance = await createEthersContractAs(truffleInstance.address, provider.getSigner(6));
    });

    it("handles a large amount of ether in a single transaction", async () => {
      await ethOwnerInstance.addPayment(99);
      await ethOwnerInstance.approveCurrentPayment();
      await ethContractorInstance.requestPayment();
      const newBalance = await provider.getBalance(accounts[6]);
      assert.equal(newBalance.toString().substr(0,5), '19800', "Error occurs on very large transaction - funds were not sent");
    });
  });

});

const createEthersContractAs = async (address, signer) => {
  const contract = new ethers.Contract(address, JSON.stringify(Payments.abi), provider);
  return contract.connect(signer);
}