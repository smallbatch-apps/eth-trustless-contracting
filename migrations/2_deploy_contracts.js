const Payments = artifacts.require("Payments");

module.exports = function(deployer, env, [OWNER, CONTRACTOR]) {
  deployer.deploy(Payments, CONTRACTOR, "GA-1276");
};
