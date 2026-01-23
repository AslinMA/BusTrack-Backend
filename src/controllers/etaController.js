 const etaCalculator = require('../services/etaCalculator');

exports.calculateETAToStop = async (req, res) => {
  try {
    const { busId, stopId } = req.query;
    
    if (!busId || !stopId) {
      return res.status(400).json({
        success: false,
        error: 'Both busId and stopId are required'
      });
    }
    
    const eta = await etaCalculator.calculateETAToStop(
      parseInt(busId),
      parseInt(stopId)
    );
    
    res.json({
      success: true,
      data: eta
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.calculateETAForRoute = async (req, res) => {
  try {
    const { busId, routeId, lat, lng } = req.query;
    
    if (!busId || !routeId || !lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'busId, routeId, lat, and lng are required'
      });
    }
    
    const eta = await etaCalculator.calculateETAForRoute(
      parseInt(busId),
      parseInt(routeId),
      parseFloat(lat),
      parseFloat(lng)
    );
    
    res.json({
      success: true,
      data: eta
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getNextBusForStop = async (req, res) => {
  try {
    const { stopId } = req.params;
    
    if (!stopId) {
      return res.status(400).json({
        success: false,
        error: 'stopId is required'
      });
    }
    
    const nextBuses = await etaCalculator.getNextBusForStop(parseInt(stopId));
    
    res.json({
      success: true,
      data: nextBuses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

