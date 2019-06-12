pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

contract Payments {

	address payable public contractor;
	address public owner;
	uint public initialAmount;
	string public projectId;

	uint8 public claimIndex;
	uint8 public approvalIndex;
	uint8 public paymentPercentage;

	bool public ownerCompleted;

	struct Payment {
		uint8 percentage;
		bool isApproved;
		bool isPaid;
	}

	Payment[] public payments;

	event PaymentApproved(string indexed projectId, address indexed contractor, uint amount);
	event PaymentClaimed(string indexed projectId, address indexed owner, address indexed contractor, uint amount);
	event ProjectComplete(string indexed projectId, address indexed contractor, uint amount);
	event ProjectClosed(string indexed projectId, address indexed owner);

	constructor (address payable _contractor, string memory _projectId) public payable {
		contractor = _contractor;
		approvalIndex = 0;
		claimIndex = 0;
		owner = msg.sender;
		initialAmount = msg.value;
		projectId = _projectId;
	}

	function addPayment(uint8 _percentage) public ownerOnly returns (uint arrayLength) {
		require(_percentage > 0 && _percentage < 100, "Invalid percentage provided");
		require(paymentPercentage + _percentage < 100, "Payments must total less than 100 percent");

		arrayLength = payments.push(Payment({
			percentage: _percentage,
			isApproved: false,
			isPaid: false
		}));

		paymentPercentage += _percentage;
	}

	function approveCurrentPayment() public ownerOnly {
		payments[approvalIndex].isApproved = true;
		uint amount = initialAmount * payments[approvalIndex].percentage / 100;
		emit PaymentApproved(projectId, contractor, amount);
		approvalIndex++;
	}

	function requestPayment() public contractorOnly {
		require(!payments[claimIndex].isPaid, "This payment has already been made");
		require(payments[claimIndex].isApproved, "The contract owner has not approved this payment");
		uint amount = initialAmount * payments[claimIndex].percentage / 100;

		contractor.transfer(amount);

		emit PaymentClaimed(projectId, owner, contractor, amount);

		payments[claimIndex].isPaid = true;
		claimIndex++;
	}

	function setCompleted() public ownerOrContractorOnly {
		if (msg.sender == contractor) {
			if(!ownerCompleted) {
				revert("The contract owner has not approved completion");
			}
			contractorCompletion();
		}

		if (msg.sender == owner) {
			ownerCompletion();
		}
	}

	function contractorCompletion() private {
		emit ProjectClosed(projectId, owner);
		selfdestruct(contractor);
	}

	function ownerCompletion() private {
		ownerCompleted = true;
		emit ProjectComplete(projectId, contractor, address(this).balance);
	}

	function getCurrentBalance() public view returns(uint) {
		return address(this).balance;
	}

	function getNextContractorPayment() public view returns (Payment memory payment) {
		payment = getPayment(claimIndex);
	}

	function getNextOwnerPayment() public view returns (Payment memory payment) {
		payment = getPayment(approvalIndex);
	}

	function getPayment(uint _index) public view returns (Payment memory payment) {
		require(_index < payments.length, "There are no matching payments");
		payment = payments[_index];
	}

	function getPaymentsLength() public view returns (uint length) {
  	length = payments.length;
  }

	modifier ownerOrContractorOnly() {
		require(msg.sender == owner || msg.sender == contractor,
			"Only the owner or contractor may do that");
		_;
	}

	modifier contractorOnly() {
		require(msg.sender == contractor,
			"Only the contractor may do that");
		_;
	}

	modifier ownerOnly() {
		require(msg.sender == owner, "Only the owner may do that");
		_;
	}

	function() external payable { }
}
