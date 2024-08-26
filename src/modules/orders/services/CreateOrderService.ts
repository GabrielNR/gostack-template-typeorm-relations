import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import AppError from '@shared/errors/AppError';
import { inject, injectable } from 'tsyringe';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    // customer existe ?
    const customerExists = await this.customersRepository.findById(customer_id);

    // Se nao existir!
    if (!customerExists) {
      throw new AppError('could not find any customer with the given id');
    }

    // Produtos Existe?
    const existsProducts = await this.productsRepository.findAllById(products);

    // Se não existir Produtos
    if (!existsProducts.length) {
      throw new AppError('could not find any products with the given ids');
    }

    // Todos products que existe -> [1,2,3,4]
    const existsProductsIds = existsProducts.map(product => product.id);

    // comparar os ids que recebe com o do BD
    const checkInexistentProducts = products.filter(
      product => !existsProductsIds.includes(product.id),
    );

    // se existir um produto no bd
    if (checkInexistentProducts.length) {
      throw new AppError(
        `could not find product ${checkInexistentProducts[0].id}`,
      );
    }

    // Buscar os produtos e mapear se tem os produtos que não possuem quantidade disponível,
    const findProductsWithNoQuantityAvailable = products.filter(
      product =>
        existsProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    // Se o produto nao possuir quantidade
    if (findProductsWithNoQuantityAvailable.length) {
      throw new AppError(
        `The quantity ${findProductsWithNoQuantityAvailable[0].quantity} is not available for ${findProductsWithNoQuantityAvailable[0].id}`,
      );
    }

    // formatar produtos pra salvar no BD
    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      // existProduto? se existir filtrar um produto que tem id igual
      price: existsProducts.filter(p => p.id === product.id)[0].price,
    }));

    // Objeto de order criada
    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    // buscar todos as ordersProducts
    const { order_products } = order;

    // ir na tabela de produtos e diminuir a quantidade
    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        existsProducts.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    // realizar o update
    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
